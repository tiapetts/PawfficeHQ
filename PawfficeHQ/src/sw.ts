// @ts-nocheck
/// <reference lib="webworker" />

import { precacheAndRoute } from "workbox-precaching";

precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener("push", (event) => {
  let payload = {
    title: "Pawffice HQ",
    body: "You have a new notification.",
    url: "/",
    icon: "/pwa-icon.png",
    badge: "/pwa-icon.png",
  };

  if (event.data) {
    try {
      payload = {
        ...payload,
        ...event.data.json(),
      };
    } catch {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      badge: payload.badge,
      data: {
        url: payload.url,
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const destination =
    typeof event.notification.data?.url === "string"
      ? event.notification.data.url
      : "/";

  event.waitUntil(
    self.clients
      .matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      .then(async (clients) => {
        for (const client of clients) {
          if ("focus" in client) {
            await client.focus();

            if ("navigate" in client) {
              await client.navigate(destination);
            }

            return;
          }
        }

        await self.clients.openWindow(destination);
      }),
  );
});
