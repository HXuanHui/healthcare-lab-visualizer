import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // 預先打包 PDF 套件，避免 dev 模式動態 import 失敗。
    include: ["html2canvas", "jspdf"],
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
