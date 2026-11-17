/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** File Handling API (installed Chromium PWAs). */
interface LaunchParams {
  readonly files?: ReadonlyArray<FileSystemFileHandle>;
}
interface LaunchQueue {
  setConsumer(consumer: (params: LaunchParams) => void | Promise<void>): void;
}
