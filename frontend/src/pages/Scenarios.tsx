import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiErrorMessage, endpoints } from "../api/client";
import { EditIcon, FlowIcon, PlayIcon, PlusIcon, TrashIcon } from "../components/icons";

export default function Scenarios() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["scenarios"],
    queryFn: endpoints.getScenarios,
  });

  const runMutation = useMutation({
    mutationFn: (id: string) => endpoints.runScenario(id),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => endpoints.deleteScenario(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["scenarios"] }),
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Сценарии</h2>
        <Link to="/scenarios/new">
          <button className="primary" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <PlusIcon width={16} height={16} /> Новый сценарий
          </button>
        </Link>
      </div>

      <div className="banner info">
        Запуск сценариев работает через официальный API Яндекса. Создание и редактирование
        используют внутренний API — для этого в Настройках нужно указать cookie сессии.
      </div>

      {isLoading && <p className="loading">Загрузка…</p>}
      {error && <div className="banner error">{apiErrorMessage(error)}</div>}
      {runMutation.isError && <div className="banner error">{apiErrorMessage(runMutation.error)}</div>}
      {deleteMutation.isError && <div className="banner error">{apiErrorMessage(deleteMutation.error)}</div>}

      {data?.length === 0 && <p className="loading">Сценариев пока нет.</p>}

      {data?.map((scenario) => (
        <div className="scenario-row" key={scenario.id}>
          <span>
            <span className="icon-badge" style={{ width: 32, height: 32, flexShrink: 0 }}>
              <FlowIcon width={15} height={15} />
            </span>
            <span className="scenario-name">{scenario.name}</span>
          </span>
          <div className="actions">
            <button
              className="secondary"
              disabled={runMutation.isPending}
              onClick={() => runMutation.mutate(scenario.id)}
              title="Запустить"
              aria-label="Запустить"
            >
              <PlayIcon width={15} height={15} />
            </button>
            <Link to={`/scenarios/${scenario.id}/edit`}>
              <button className="secondary" title="Изменить" aria-label="Изменить">
                <EditIcon width={15} height={15} />
              </button>
            </Link>
            <button
              className="danger"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (confirm(`Удалить сценарий «${scenario.name}»?`)) {
                  deleteMutation.mutate(scenario.id);
                }
              }}
              title="Удалить"
              aria-label="Удалить"
            >
              <TrashIcon width={15} height={15} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
