import { StatusBarState } from "../types";
import { I18N } from "../SedimentManager";

/**
 * 状态栏指示器：展示沉积层活跃状态与今日新增数量。
 * 点击状态栏可打开今日地质简报（不存在则生成）。
 */
export class SedimentIndicator {
  private el: HTMLElement;
  private onClickCb: (() => void) | null = null;
  private state: StatusBarState = "idle";

  constructor(statusBarItem: HTMLElement) {
    this.el = statusBarItem;
    this.el.addClass("sediment-status-bar");
    this.setState("idle");
  }

  /** 展示今日新增数量（"今日 +N"） */
  setTodayCount(n: number): void {
    this.state = "idle";
    this.el.setText(I18N.statusBarDeposit(n));
  }

  /** 展示断层待观察数量 */
  setFaultCount(n: number): void {
    this.state = "conflict";
    this.el.setText(I18N.statusBarConflict(n));
  }

  /** 展示矿脉数量 */
  setVeinCount(n: number): void {
    this.veinCount = n;
    this.el.setText(`矿脉 ${n}`);
  }
  private veinCount = 0;
  private wormholeCount = 0;
  private hybridCount = 0;

  /** 完整 💎 态：化石 + 断层 + 矿脉（+ 虫洞 + 灵感） */
  setCounts(
    fossil: number,
    fault: number,
    vein: number,
    wormhole = 0,
    hybrid = 0
  ): void {
    this.state = fault > 0 ? "conflict" : "idle";
    this.veinCount = vein;
    this.wormholeCount = wormhole;
    this.hybridCount = hybrid;
    this.el.setText(I18N.statusBarFull(fossil, fault, vein, wormhole, hybrid));
  }

  /** 重置为默认活跃状态（"沉积层活跃"） */
  setState(state: StatusBarState): void {
    this.state = state;
    if (state === "idle") {
      this.el.setText(I18N.statusBarIdle);
    }
  }

  /** 总开关关闭时显示"已关闭"灰显提示（而非隐藏），让用户区分"没开"与"开了但没沉积" */
  setEnabled(enabled: boolean): void {
    this.el.style.display = "";
    this.el.style.opacity = enabled ? "" : "0.5";
    if (enabled) {
      this.el.removeClass("sediment-disabled");
    } else {
      this.el.addClass("sediment-disabled");
      this.el.setText("🪨 沉积层已关闭");
    }
  }

  /** 注册点击事件回调 */
  onClick(callback: () => void): void {
    this.onClickCb = callback;
    this.el.addEventListener("click", () => this.onClickCb?.());
  }
}
