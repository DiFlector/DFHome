import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiErrorMessage, endpoints } from "../../api/client";
import type { StationCommand, StationWidget, WidgetSize } from "../../api/types";
import { MusicIcon } from "../icons";

interface Props {
  widget: StationWidget;
  size: WidgetSize;
  onRemove: () => void;
}

function fmtTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const POLL_MS = 5000;

export default function StationCard({ widget, size, onRemove }: Props) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, dataUpdatedAt } = useQuery({
    queryKey: ["station", widget.device_id],
    queryFn: () => endpoints.getStationState(widget.device_id),
    refetchInterval: POLL_MS,
    retry: 1,
  });

  const [tick, setTick] = useState(0);
  useEffect(() => {
    setTick(0);
    if (!data?.playing) return;
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [data, dataUpdatedAt]);

  const command = useMutation({
    mutationFn: ({ cmd, position }: { cmd: StationCommand; position?: number }) =>
      endpoints.stationCommand(widget.device_id, cmd, position !== undefined ? { position } : undefined),
    onSuccess: (state) => queryClient.setQueryData(["station", widget.device_id], state),
  });

  const duration = data?.duration ?? 0;
  const progress = data ? Math.min((data.progress ?? 0) + (data.playing ? tick : 0), duration || Infinity) : 0;
  const hasTrack = Boolean(data?.title);
  const isMedium = size === "m";

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    command.mutate({ cmd: "rewind", position: fraction * duration });
  };

  const cover = data?.cover_url ? (
    <img className="station-cover" src={data.cover_url} alt="" />
  ) : (
    <div className="station-cover station-cover-empty">
      <MusicIcon width={22} height={22} />
    </div>
  );

  const playback =
    duration > 0 ? (
      <div className="station-playback">
        <div
          className="station-progress"
          onClick={seek}
          role="slider"
          aria-label="Позиция трека"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(progress)}
        >
          <div className="station-progress-fill" style={{ width: `${(progress / duration) * 100}%` }} />
        </div>
        <div className="station-times">
          <span>{fmtTime(progress)}</span>
          <span>{fmtTime(duration)}</span>
        </div>
      </div>
    ) : null;

  return (
    <div className="widget-card station-card">
      <div className="widget-card-header">
        <span>{widget.device_name}</span>
        <button type="button" className="remove-btn" onClick={onRemove} aria-label="Удалить виджет">
          ×
        </button>
      </div>

      {isLoading && <span className="loading station-loading">…</span>}
      {isError && <span className="widget-error">{apiErrorMessage(error)}</span>}

      {data && !hasTrack && isMedium && (
        <div className="station-body station-body-m">
          <div className="station-m-main station-m-main-idle">
            <div className="station-cover station-cover-empty">
              <MusicIcon width={20} height={20} />
            </div>
            <div className="station-idle">Ничего не играет</div>
          </div>
        </div>
      )}

      {data && !hasTrack && !isMedium && (
        <div className="station-body station-body-compact">
          <div className="station-track">
            <div className="station-cover station-cover-empty">
              <MusicIcon width={22} height={22} />
            </div>
            <div className="station-track-meta">
              <div className="station-idle">Ничего не играет</div>
            </div>
          </div>
        </div>
      )}

      {data && hasTrack && isMedium && (
        <div className={`station-body station-body-m${data.playing ? " is-playing" : ""}`}>
          <div className="station-m-main">
            {cover}
            <div className="station-m-info">
              <div className="station-title" title={data.title ?? undefined}>
                {data.title}
              </div>
              {data.artist && (
                <div className="station-artist" title={data.artist}>
                  {data.artist}
                </div>
              )}
            </div>
          </div>
          {playback}
        </div>
      )}

      {data && hasTrack && !isMedium && (
        <div className="station-body">
          <div className="station-track">
            {cover}
            <div className="station-track-meta">
              <div className="station-title" title={data.title ?? undefined}>
                {data.title}
              </div>
              {data.artist && (
                <div className="station-artist" title={data.artist}>
                  {data.artist}
                </div>
              )}
            </div>
          </div>
          {playback}
        </div>
      )}
    </div>
  );
}
