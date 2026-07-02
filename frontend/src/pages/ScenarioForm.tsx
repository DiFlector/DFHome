import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiErrorMessage, endpoints } from "../api/client";
import type { DeviceView, ScenarioAction, ScenarioPayload, ScenarioTrigger } from "../api/types";
import { ActionEditor, TriggerEditor } from "../components/ScenarioEditor";

function allDevices(home?: { rooms: { devices: DeviceView[] }[]; unassigned_devices: DeviceView[] }): DeviceView[] {
  if (!home) return [];
  return [...home.rooms.flatMap((r) => r.devices), ...home.unassigned_devices];
}

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return idCounter;
}

export default function ScenarioForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const { data: home } = useQuery({ queryKey: ["home"], queryFn: endpoints.getHome });
  const { data: existing, isLoading: loadingExisting } = useQuery({
    queryKey: ["scenario-edit", id],
    queryFn: () => endpoints.getScenarioForEdit(id!),
    enabled: isEdit,
  });

  const [name, setName] = useState("");
  const [triggers, setTriggers] = useState<(ScenarioTrigger & { _key: number })[]>([]);
  const [actions, setActions] = useState<(ScenarioAction & { _key: number })[]>([]);

  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setTriggers(existing.triggers.map((t) => ({ ...t, _key: nextId() })));
      setActions(existing.actions.map((a) => ({ ...a, _key: nextId() })));
    }
  }, [existing]);

  const devices = allDevices(home);

  const saveMutation = useMutation({
    mutationFn: (payload: ScenarioPayload) =>
      isEdit ? endpoints.updateScenario(id!, payload) : endpoints.createScenario(payload),
    onSuccess: () => navigate("/scenarios"),
  });

  // The device-property trigger's "value" field is a plain text input (we
  // don't know the property's real type ahead of time), so coerce it to a
  // number/boolean where it obviously looks like one instead of always
  // sending a string that Yandex's schema validation will reject.
  const coerceTriggerValue = (trigger: ScenarioTrigger): ScenarioTrigger => {
    if (trigger.kind !== "device_property" || typeof trigger.value !== "string") return trigger;
    const raw = trigger.value.trim();
    if (raw === "true" || raw === "false") return { ...trigger, value: raw === "true" };
    if (raw !== "" && !Number.isNaN(Number(raw))) return { ...trigger, value: Number(raw) };
    return trigger;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: ScenarioPayload = {
      name,
      triggers: triggers.map(({ _key, ...t }) => coerceTriggerValue(t)),
      actions: actions.map(({ _key, ...a }) => a),
    };
    saveMutation.mutate(payload);
  };

  if (isEdit && loadingExisting) return <p className="loading">Загрузка сценария…</p>;

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ marginTop: 0 }}>{isEdit ? "Редактировать сценарий" : "Новый сценарий"}</h2>

      {isEdit && existing && existing.triggers.length === 0 && existing.actions.length === 0 && (
        <div className="banner info">
          Не удалось распознать существующие условия/действия этого сценария (неофициальный API
          Яндекса). Задайте их заново — имя сохранено.
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-field">
          <label>Название</label>
          <input type="text" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <h3>Условия запуска</h3>
        {triggers.map((t) => (
          <TriggerEditor
            key={t._key}
            trigger={t}
            devices={devices}
            onChange={(updated) => setTriggers(triggers.map((x) => (x._key === t._key ? { ...updated, _key: t._key } : x)))}
            onRemove={() => setTriggers(triggers.filter((x) => x._key !== t._key))}
          />
        ))}
        <button
          type="button"
          className="secondary"
          onClick={() => setTriggers([...triggers, { kind: "voice_phrase", _key: nextId() }])}
        >
          + Добавить условие
        </button>

        <h3>Действия</h3>
        {actions.map((a) => (
          <ActionEditor
            key={a._key}
            action={a}
            devices={devices}
            onChange={(updated) => setActions(actions.map((x) => (x._key === a._key ? { ...updated, _key: a._key } : x)))}
            onRemove={() => setActions(actions.filter((x) => x._key !== a._key))}
          />
        ))}
        <button
          type="button"
          className="secondary"
          onClick={() => setActions([...actions, { kind: "device_capability", _key: nextId() }])}
        >
          + Добавить действие
        </button>

        <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
          <button className="primary" type="submit" disabled={saveMutation.isPending}>
            Сохранить
          </button>
          <button type="button" className="secondary" onClick={() => navigate("/scenarios")}>
            Отмена
          </button>
        </div>

        {saveMutation.isError && <div className="banner error">{apiErrorMessage(saveMutation.error)}</div>}
      </form>
    </div>
  );
}
