/** A plain `EventTarget` whose `add`/`removeEventListener` narrow to a known event map. */
export class TypedEventTarget<EventMap extends Record<string, Event>>
  extends EventTarget {
  declare addEventListener:
    & (<K extends keyof EventMap & string>(
      type: K,
      listener: (event: EventMap[K]) => void,
      options?: boolean | AddEventListenerOptions,
    ) => void)
    & EventTarget["addEventListener"];

  declare removeEventListener:
    & (<K extends keyof EventMap & string>(
      type: K,
      listener: (event: EventMap[K]) => void,
      options?: boolean | EventListenerOptions,
    ) => void)
    & EventTarget["removeEventListener"];
}
