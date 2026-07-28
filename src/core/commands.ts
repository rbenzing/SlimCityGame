import type { Command } from '../shared/types';

/** One batch of commands submitted together, tagged with its queue sequence number. */
export interface CommandBatch {
  seq: number;
  commands: Command[];
}

/**
 * FIFO queue of command batches. The UI/tools
 * layer pushes batches of player commands; whichever thread owns the queue
 * (typically the sim worker) drains it once per tick/frame to apply the
 * batches in order.
 *
 * `push` assigns each batch a monotonically increasing sequence number
 * (starting at 1) so the caller can correlate a later `CommandAck` back to
 * the batch that produced it. `drain` returns everything queued since the
 * last drain, in push order, and empties the queue.
 */
export class CommandQueue {
  private nextSeq = 1;
  private pending: CommandBatch[] = [];

  /** Enqueue a batch of commands. Returns the seq assigned to this batch. */
  push(commands: Command[]): number {
    const seq = this.nextSeq;
    this.nextSeq += 1;
    // Defensive copy: the caller mutating its array after push must not
    // affect the queued batch.
    this.pending.push({ seq, commands: [...commands] });
    return seq;
  }

  /** Return all batches queued since the last drain, in push order, and empty the queue. */
  drain(): CommandBatch[] {
    const batches = this.pending;
    this.pending = [];
    return batches;
  }
}
