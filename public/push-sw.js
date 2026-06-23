// Handlers de Web Push para Settlia. Lo importa el service worker de Workbox
// (ver vite.config.ts → workbox.importScripts). Muestra la notificación cuando
// llega un push y enfoca/abre la app al pulsarla.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Settlia";
  const options = {
    body: data.body || "",
    icon: "/settly/icons/icon-192.png",
    badge: "/settly/icons/icon-192.png",
    data: { url: data.url || "/settly/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/settly/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
