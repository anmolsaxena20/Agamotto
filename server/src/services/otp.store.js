const store = new Map();

export function savePendingOtp(email, type, data) {
  const key = `${type}:${email.toLowerCase()}`;
  store.set(key, {
    ...data,
    createdAt: Date.now(),
  });
}

export function getPendingOtp(email, type) {
  const key = `${type}:${email.toLowerCase()}`;
  const record = store.get(key);
  if (!record) {
    return null;
  }
  if (Date.now() > record.expiresAt) {
    store.delete(key);
    return null;
  }
  return record;
}

export function deletePendingOtp(email, type) {
  const key = `${type}:${email.toLowerCase()}`;
  store.delete(key);
}

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of store.entries()) {
    if (now > value.expiresAt) {
      store.delete(key);
    }
  }
}, 60 * 1000).unref();
