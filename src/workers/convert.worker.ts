import { quantize, type QuantizeInput } from "../core/quantize";
import { preparePhoto, type PhotoInput } from "../core/photo";
self.onmessage = (event: MessageEvent<QuantizeInput & PhotoInput>) => {
  try {
    const data = preparePhoto(event.data, (value) =>
      self.postMessage({ type: "progress", value }),
    );
    const cells = quantize(
      { ...event.data, data, precise: event.data.settings.mode === "pixel" },
      (n) =>
        self.postMessage({ type: "progress", value: 20 + Math.round(n * 0.8) }),
    );
    self.postMessage({ type: "result", cells });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "转换失败",
    });
  }
};
