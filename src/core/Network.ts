import { io, Socket } from 'socket.io-client';
import type { Point } from '../Types';

export class NetworkManager {
  private socket: Socket | null = null;
  private enemySnakes: Map<string, Point[]> = new Map();

  constructor() {
    // Skeleton for multiplayer
  }

  public connect(url: string): void {
    this.socket = io(url);

    this.socket.on('snakeUpdate', (data: { id: string, snake: Point[] }) => {
      this.enemySnakes.set(data.id, data.snake);
    });

    this.socket.on('playerDisconnected', (id: string) => {
      this.enemySnakes.delete(id);
    });
  }

  public sendUpdate(snake: Point[]): void {
    if (this.socket?.connected) {
      this.socket.emit('updatePosition', snake);
    }
  }

  public getEnemySnakes(): Map<string, Point[]> {
    return this.enemySnakes;
  }
}
