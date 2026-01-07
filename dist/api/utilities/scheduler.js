import { Muxer } from '../muxer.js';
/**
 * Pipeline scheduler for chaining components.
 *
 * Allows piping between components (Decoder → Filter → Encoder → Output).
 */
export class Scheduler {
    firstComponent;
    /** @internal */
    lastComponent;
    /**
     * @param firstComponent - First component in the pipeline
     *
     * @param lastComponent - Last component in the pipeline (defaults to firstComponent)
     *
     * @internal
     */
    constructor(firstComponent, lastComponent) {
        this.firstComponent = firstComponent;
        this.lastComponent = lastComponent ?? firstComponent;
    }
    pipeTo(target, streamIndex) {
        if (typeof this.lastComponent.pipeTo === 'function') {
            if (target instanceof Muxer) {
                // Start the pipe task (encoder -> output)
                this.lastComponent.pipeTo(target, streamIndex);
                // Return control with correct firstComponent (not lastComponent!)
                return new SchedulerControl(this.firstComponent);
            }
            else {
                const resultScheduler = this.lastComponent.pipeTo(target);
                // Keep the original firstComponent, update to new lastComponent
                return new Scheduler(this.firstComponent, resultScheduler.lastComponent);
            }
        }
        throw new Error('Last component does not support pipeTo');
    }
    /**
     * Send an item into the pipeline or flush.
     *
     * When item is provided, queues it for processing through the pipeline.
     * When null is provided, triggers flush sequence through all components.
     *
     * @param item - Packet or Frame to process, or null to flush
     *
     * @example
     * ```typescript
     * // Send packet for processing
     * await scheduler.send(packet);
     *
     * // Flush pipeline
     * await scheduler.send(null);
     * ```
     */
    async send(item) {
        await this.firstComponent.sendToQueue(item);
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
export class SchedulerControl {
    firstComponent;
    /**
     * @param firstComponent - First component in the pipeline
     *
     * @internal
     */
    constructor(firstComponent) {
        this.firstComponent = firstComponent;
    }
    /**
     * Send an item into the pipeline or flush.
     *
     * When item is provided, queues it for processing through the pipeline.
     * When null is provided, triggers flush sequence through all components.
     *
     * @param item - Packet or Frame to process, or null to flush
     *
     * @example
     * ```typescript
     * // Send packet for processing
     * await control.send(packet);
     *
     * // Flush pipeline
     * await control.send(null);
     * ```
     */
    async send(item) {
        await this.firstComponent.sendToQueue(item);
    }
}
//# sourceMappingURL=scheduler.js.map