import { Muxer } from '../muxer.js';

import type { Frame, Packet } from '../../lib/index.js';
import type { BitStreamFilterAPI } from '../bitstream-filter.js';
import type { Encoder } from '../encoder.js';
import type { FilterAPI } from '../filter.js';

export interface SchedulableComponent<TItem = Packet | Frame> {
  sendToQueue(item: TItem): Promise<void>;
  flushPipeline(): Promise<void>;
  pipeTo(target: FilterAPI | Encoder | BitStreamFilterAPI | Muxer, streamIndex?: number): any;
}

/**
 * Pipeline scheduler for chaining components.
 *
 * Allows piping between components (Decoder → Filter → Encoder → Output).
 */
export class Scheduler<TSend = Packet | Frame> implements AsyncDisposable {
  private firstComponent: SchedulableComponent<TSend>;

  /** @internal */
  lastComponent: SchedulableComponent<any>;

  /**
   * @param firstComponent - First component in the pipeline
   *
   * @param lastComponent - Last component in the pipeline (defaults to firstComponent)
   *
   * @internal
   */
  constructor(firstComponent: SchedulableComponent<TSend>, lastComponent?: SchedulableComponent<any>) {
    this.firstComponent = firstComponent;
    this.lastComponent = lastComponent ?? firstComponent;
  }

  /**
   * Pipe output to a filter component.
   *
   * @param target - Filter to receive frames
   *
   * @returns Scheduler for continued chaining
   *
   * @example
   * ```typescript
   * decoder.pipeTo(filter1).pipeTo(filter2)
   * ```
   */
  pipeTo(target: FilterAPI): Scheduler<TSend>;

  /**
   * Pipe output to an encoder component.
   *
   * @param target - Encoder to receive frames
   *
   * @returns Scheduler for continued chaining
   *
   * @example
   * ```typescript
   * decoder.pipeTo(filter).pipeTo(encoder)
   * ```
   */
  pipeTo(target: Encoder): Scheduler<TSend>;

  /**
   * Pipe output to a bitstream filter component.
   *
   * @param target - BitStreamFilter to receive packets
   *
   * @returns Scheduler for continued chaining
   *
   * @example
   * ```typescript
   * decoder.pipeTo(encoder).pipeTo(bsf).pipeTo(output, 0)
   * ```
   */
  pipeTo(target: BitStreamFilterAPI): Scheduler<TSend>;

  /**
   * Pipe output to a muxer (final stage).
   *
   * @param output - Muxer to write to
   *
   * @param streamIndex - Stream index in output
   *
   * @returns Control interface without pipeTo
   *
   * @example
   * ```typescript
   * const control = decoder
   *   .pipeTo(encoder)
   *   .pipeTo(output, 0);
   *
   * await control.send(packet);
   * ```
   */
  pipeTo(output: Muxer, streamIndex: number): SchedulerControl<TSend>;

  pipeTo(target: FilterAPI | Encoder | BitStreamFilterAPI | Muxer, streamIndex?: number): Scheduler<TSend> | SchedulerControl<TSend> {
    if (typeof this.lastComponent.pipeTo === 'function') {
      if (target instanceof Muxer) {
        // Start the pipe task (encoder -> output)
        this.lastComponent.pipeTo(target, streamIndex);
        // Return control with correct firstComponent (not lastComponent!)
        return new SchedulerControl<TSend>(this.firstComponent);
      } else {
        const resultScheduler = this.lastComponent.pipeTo(target);
        // Keep the original firstComponent, update to new lastComponent
        return new Scheduler<TSend>(this.firstComponent, resultScheduler.lastComponent);
      }
    }

    throw new Error('Last component does not support pipeTo');
  }

  /**
   * Send an item into the pipeline.
   *
   * @param item - Packet or Frame to process
   *
   * @example
   * ```typescript
   * try {
   *   await scheduler.send(packet);
   * } catch (error) {
   *   console.error('Pipeline error:', error);
   * }
   * ```
   */
  async send(item: TSend): Promise<void> {
    await this.firstComponent.sendToQueue(item);
  }

  /**
   * Flush the pipeline.
   *
   * @example
   * ```typescript
   * await scheduler.flush();
   * ```
   */
  async flush(): Promise<void> {
    await this.firstComponent.flushPipeline();
  }

  /**
   * Cleanup resources.
   *
   * @example
   * ```typescript
   * await using scheduler;
   * ```
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.flush();
  }
}

/**
 * Control interface for completed pipelines.
 *
 * Provides control methods without pipeTo() - this is the final
 * stage after piping to Muxer.
 *
 * @template TSend - The input type flowing through the pipeline
 */
export class SchedulerControl<TSend = Packet | Frame> implements AsyncDisposable {
  private firstComponent: SchedulableComponent<TSend>;

  /**
   * @param firstComponent - First component in the pipeline
   *
   * @internal
   */
  constructor(firstComponent: SchedulableComponent<TSend>) {
    this.firstComponent = firstComponent;
  }

  /**
   * Send an item into the pipeline.
   *
   * @param item - Packet or Frame to process
   *
   * @example
   * ```typescript
   * try {
   *   await control.send(packet);
   * } catch (error) {
   *   console.error('Pipeline error:', error);
   * }
   * ```
   */
  async send(item: TSend): Promise<void> {
    await this.firstComponent.sendToQueue(item);
  }

  /**
   * Flush the pipeline.
   *
   * @example
   * ```typescript
   * await control.flush();
   * ```
   */
  async flush(): Promise<void> {
    await this.firstComponent.flushPipeline();
  }

  /**
   * Cleanup resources.
   *
   * @example
   * ```typescript
   * await using control;
   * ```
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.flush();
  }
}
