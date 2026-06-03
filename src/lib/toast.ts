export type ToastLevel = "success" | "error" | "info";
export type ToastHandler = (message: string, level: ToastLevel, id: number) => void;

let _handler: ToastHandler | null = null;
let _counter = 0;

export const toast = {
  success: (msg: string) => _handler?.(msg, "success", ++_counter),
  error: (msg: string) => _handler?.(msg, "error", ++_counter),
  info: (msg: string) => _handler?.(msg, "info", ++_counter),
  _register: (fn: ToastHandler) => {
    _handler = fn;
  },
  _unregister: () => {
    _handler = null;
  },
};
