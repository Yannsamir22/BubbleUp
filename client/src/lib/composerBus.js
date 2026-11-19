/**
 * Lets other parts of the UI (the getting-started guide, empty-channel tips)
 * ask the message box to focus itself or open the file picker.
 */
const bus = new EventTarget();

export const composer = {
  focus: () => bus.dispatchEvent(new Event("focus")),
  attach: () => bus.dispatchEvent(new Event("attach")),
  on(type, handler) {
    bus.addEventListener(type, handler);
    return () => bus.removeEventListener(type, handler);
  },
};
