export type ValueTarget = {
  value: string;
  dispatchEvent: (event: Event) => boolean;
};

export type CheckedTarget = {
  checked: boolean;
  dispatchEvent: (event: Event) => boolean;
};

function fire(target: { dispatchEvent: (event: Event) => boolean }, type: string) {
  const EventCtor = globalThis.Event;
  const event = EventCtor
    ? new EventCtor(type, { bubbles: true })
    : ({ type, bubbles: true } as Event);
  target.dispatchEvent(event);
}

/** React-safe value write: call the DOM prototype setter, then input and change. */
export function setNativeValue(
  element: ValueTarget,
  value: string,
  setter?: (this: unknown, value: string) => void
) {
  if (setter) setter.call(element, value);
  else element.value = value;
  fire(element, "input");
  fire(element, "change");
}

export function setNativeChecked(
  element: CheckedTarget,
  checked: boolean,
  setter?: (this: unknown, checked: boolean) => void
) {
  if (setter) setter.call(element, checked);
  else element.checked = checked;
  fire(element, "input");
  fire(element, "change");
}

export function assignFileList(
  element: ValueTarget & { files: unknown },
  files: unknown
) {
  element.files = files;
  fire(element, "input");
  fire(element, "change");
}
