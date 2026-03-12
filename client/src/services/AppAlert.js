// AppAlert.js
// ตัวช่วยทำ "Custom Alert Modal" แบบ global เพื่อให้ UI คลีนและคุมสไตล์ได้ทุกหน้าจอ
// ใช้แทน/ครอบ React Native `Alert.alert()` (ซึ่งปรับดีไซน์ไม่ได้)

let nextId = 1;
let pending = [];
const subscribers = new Set();

const normalizeButtons = (buttons) => {
  if (!Array.isArray(buttons) || buttons.length === 0) {
    return [{ text: 'OK' }];
  }
  return buttons.map((b) => ({
    text: String(b?.text ?? 'OK'),
    onPress: typeof b?.onPress === 'function' ? b.onPress : null,
    style: b?.style || 'default', // 'default' | 'cancel' | 'destructive'
  }));
};

const normalizeOptions = (options) => ({
  cancelable: options?.cancelable !== false,
});

const notify = () => {
  const snapshot = pending.slice();
  subscribers.forEach((fn) => {
    try {
      fn(snapshot);
    } catch (_) { }
  });
};

export const subscribeAppAlerts = (fn) => {
  subscribers.add(fn);
  fn(pending.slice());
  return () => subscribers.delete(fn);
};

export const enqueueAppAlert = (payload) => {
  const item = {
    id: `app-alert-${nextId++}`,
    title: String(payload?.title ?? ''),
    message: payload?.message == null ? '' : String(payload.message),
    buttons: normalizeButtons(payload?.buttons),
    options: normalizeOptions(payload?.options),
  };
  pending = [...pending, item];
  notify();
  return item.id;
};

export const consumeAppAlert = (id) => {
  if (!id) return;
  const before = pending.length;
  pending = pending.filter((x) => x?.id !== id);
  if (pending.length !== before) notify();
};

export const clearAllAppAlerts = () => {
  if (!pending.length) return;
  pending = [];
  notify();
};

// Drop-in API compatible with React Native Alert.alert(title, message, buttons, options)
export const alert = (title, message, buttons, options) =>
  enqueueAppAlert({ title, message, buttons, options });

