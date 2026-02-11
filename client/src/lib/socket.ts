import { io, type Socket } from 'socket.io-client';

function getServerUrl(): string {
  const env = (import.meta as any).env?.VITE_SERVER_URL as string | undefined;
  if (env && env.trim()) return env.trim();
  return window.location.origin;
}

export function createSocket(): Socket {
  return io(getServerUrl(), {
    autoConnect: false,
    transports: ['websocket']
  });
}

