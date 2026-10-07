import { quantize, type QuantizeInput } from "../core/quantize";
self.onmessage = (event: MessageEvent<QuantizeInput>) => {
  try {
    const cells = quantize(event.data, (n) =>
      self.postMessage({ type: "progress", value: n }),
    );
    self.postMessage({ type: "result", cells });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "转换失败",
    });
  }
};
