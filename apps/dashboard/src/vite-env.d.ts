// apps/dashboard/src/vite-env.d.ts
/// <reference types="vite/client" />

declare module '*.css' {
  const content: { [className: string]: string };
  export default content;
}
