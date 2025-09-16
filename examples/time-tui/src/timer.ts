import { derive, name, accessor } from "@pumped-fn/core-next";
import { timeSource } from "./time-source";
import { config } from "./config";
import { renderer } from "./renderer";

const timeAccessorKey = accessor("timeAccessor", {} as any);
const renderAccessorKey = accessor("renderAccessor", {} as any);
const configKey = accessor("config", {} as any);

export const timer = derive([timeSource.static, renderer.static, config.reactive], (deps, ctl) => {
  const timeAccessor = timeAccessorKey.get(deps);
  const renderAccessor = renderAccessorKey.get(deps);
  const cfg = configKey.get(deps);

  const tick = () => {
    timeAccessor.update(new Date());
    renderAccessor.get().render();
  };

  tick();

  const interval = setInterval(tick, cfg.updateInterval);
  ctl.cleanup(() => clearInterval(interval));

  return { tick };
}, name("timer"));