import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { apiErrorMessage, endpoints } from "../api/client";
import DeviceCard from "../components/DeviceCard";
import { ChevronLeftIcon } from "../components/icons";

export default function DeviceDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ["device", id],
    queryFn: () => endpoints.getDevice(id!),
    enabled: Boolean(id),
    refetchInterval: 10000,
  });

  return (
    <div>
      <Link
        to="/"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          color: "var(--text-muted)",
          textDecoration: "none",
          fontSize: 14,
          marginBottom: 16,
        }}
      >
        <ChevronLeftIcon width={16} height={16} /> Ко всем устройствам
      </Link>
      {isLoading && <p className="loading">Загрузка…</p>}
      {error && <div className="banner error">{apiErrorMessage(error)}</div>}
      {data && (
        <div style={{ maxWidth: 360 }}>
          <DeviceCard device={data} />
        </div>
      )}
    </div>
  );
}
