import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiErrorMessage, endpoints } from "../api/client";
import DeviceCard from "../components/DeviceCard";

export default function Dashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["home"],
    queryFn: endpoints.getHome,
    refetchInterval: 15000,
  });

  if (isLoading) return <p className="loading">Загрузка устройств…</p>;

  if (error) {
    return (
      <div className="banner error">
        {apiErrorMessage(error)}{" "}
        <Link to="/settings">Перейти в Настройки</Link>
      </div>
    );
  }

  if (!data) return null;

  const hasAnyDevices = data.rooms.some((r) => r.devices.length > 0) || data.unassigned_devices.length > 0;

  if (!hasAnyDevices) {
    return <p className="loading">Устройства не найдены. Проверьте аккаунт Яндекса.</p>;
  }

  return (
    <div>
      <h2 style={{ marginTop: 0, marginBottom: 20 }}>Устройства</h2>
      {data.rooms
        .filter((room) => room.devices.length > 0)
        .map((room) => (
          <section className="room-section" key={room.id}>
            <h2>{room.name}</h2>
            <div className="device-grid">
              {room.devices.map((device) => (
                <DeviceCard key={device.id} device={device} />
              ))}
            </div>
          </section>
        ))}

      {data.unassigned_devices.length > 0 && (
        <section className="room-section">
          <h2>Без комнаты</h2>
          <div className="device-grid">
            {data.unassigned_devices.map((device) => (
              <DeviceCard key={device.id} device={device} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
