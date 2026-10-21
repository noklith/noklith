import { o as i$1, m as i$2, n as b, aq as E } from "./appkit-DSMu6gPS.js";
import { n as n$1, e, a as e$1 } from "./class-map-8z_gfTFE.js";
import { r as resetStyles, c as colorStyles, e as elementStyles } from "./core-Bj0sLh00.js";
import { f, n as n$2 } from "./async-directive-DKat5cb1.js";
const UiHelperUtil = {
  getSpacingStyles(spacing, index) {
    if (Array.isArray(spacing)) {
      return spacing[index] ? `var(--wui-spacing-${spacing[index]})` : void 0;
    } else if (typeof spacing === "string") {
      return `var(--wui-spacing-${spacing})`;
    }
    return void 0;
  },
  getFormattedDate(date) {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
  },
  getHostName(url) {
    try {
      const newUrl = new URL(url);
      return newUrl.hostname;
    } catch (error) {
      return "";
    }
  },
  getTruncateString({ string, charsStart, charsEnd, truncate }) {
    if (string.length <= charsStart + charsEnd) {
      return string;
    }
    if (truncate === "end") {
      return `${string.substring(0, charsStart)}...`;
    } else if (truncate === "start") {
      return `...${string.substring(string.length - charsEnd)}`;
    }
    return `${string.substring(0, Math.floor(charsStart))}...${string.substring(string.length - Math.floor(charsEnd))}`;
  },
  generateAvatarColors(address) {
    const hash = address.toLowerCase().replace(/^0x/iu, "").replace(/[^a-f0-9]/gu, "");
    const baseColor = hash.substring(0, 6).padEnd(6, "0");
    const rgbColor = this.hexToRgb(baseColor);
    const masterBorderRadius = getComputedStyle(document.documentElement).getPropertyValue("--w3m-border-radius-master");
    const radius = Number(masterBorderRadius == null ? void 0 : masterBorderRadius.replace("px", ""));
    const edge = 100 - 3 * radius;
    const gradientCircle = `${edge}% ${edge}% at 65% 40%`;
    const colors = [];
    for (let i2 = 0; i2 < 5; i2 += 1) {
      const tintedColor = this.tintColor(rgbColor, 0.15 * i2);
      colors.push(`rgb(${tintedColor[0]}, ${tintedColor[1]}, ${tintedColor[2]})`);
    }
    return `
    --local-color-1: ${colors[0]};
    --local-color-2: ${colors[1]};
    --local-color-3: ${colors[2]};
    --local-color-4: ${colors[3]};
    --local-color-5: ${colors[4]};
    --local-radial-circle: ${gradientCircle}
   `;
  },
  hexToRgb(hex) {
    const bigint = parseInt(hex, 16);
    const r = bigint >> 16 & 255;
    const g = bigint >> 8 & 255;
    const b2 = bigint & 255;
    return [r, g, b2];
  },
  tintColor(rgb, tint) {
    const [r, g, b2] = rgb;
    const tintedR = Math.round(r + (255 - r) * tint);
    const tintedG = Math.round(g + (255 - g) * tint);
    const tintedB = Math.round(b2 + (255 - b2) * tint);
    return [tintedR, tintedG, tintedB];
  },
  isNumber(character) {
    const regex = {
      number: /^[0-9]+$/u
    };
    return regex.number.test(character);
  },
  getColorTheme(theme) {
    var _a;
    if (theme) {
      return theme;
    } else if (typeof window !== "undefined" && window.matchMedia) {
      if ((_a = window.matchMedia("(prefers-color-scheme: dark)")) == null ? void 0 : _a.matches) {
        return "dark";
      }
      return "light";
    }
    return "dark";
  },
  splitBalance(input) {
    const parts = input.split(".");
    if (parts.length === 2) {
      return [parts[0], parts[1]];
    }
    return ["0", "00"];
  },
  roundNumber(number, threshold, fixed) {
    const roundedNumber = number.toString().length >= threshold ? Number(number).toFixed(fixed) : number;
    return roundedNumber;
  },
  formatNumberToLocalString(value, decimals = 2) {
    if (value === void 0) {
      return "0.00";
    }
    if (typeof value === "number") {
      return value.toLocaleString("en-US", {
        maximumFractionDigits: decimals,
        minimumFractionDigits: decimals
      });
    }
    return parseFloat(value).toLocaleString("en-US", {
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals
    });
  }
};
function standardCustomElement(tagName, descriptor) {
  const { kind, elements } = descriptor;
  return {
    kind,
    elements,
    finisher(clazz) {
      if (!customElements.get(tagName)) {
        customElements.define(tagName, clazz);
      }
    }
  };
}
function legacyCustomElement(tagName, clazz) {
  if (!customElements.get(tagName)) {
    customElements.define(tagName, clazz);
  }
  return clazz;
}
function customElement(tagName) {
  return function create(classOrDescriptor) {
    return typeof classOrDescriptor === "function" ? legacyCustomElement(tagName, classOrDescriptor) : standardCustomElement(tagName, classOrDescriptor);
  };
}
const styles$6 = i$1`
  :host {
    display: flex;
    width: inherit;
    height: inherit;
  }
`;
var __decorate$6 = function(decorators, target, key, desc) {
  var c2 = arguments.length, r = c2 < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
  if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
  else for (var i2 = decorators.length - 1; i2 >= 0; i2--) if (d = decorators[i2]) r = (c2 < 3 ? d(r) : c2 > 3 ? d(target, key, r) : d(target, key)) || r;
  return c2 > 3 && r && Object.defineProperty(target, key, r), r;
};
let WuiFlex = class WuiFlex2 extends i$2 {
  render() {
    this.style.cssText = `
      flex-direction: ${this.flexDirection};
      flex-wrap: ${this.flexWrap};
      flex-basis: ${this.flexBasis};
      flex-grow: ${this.flexGrow};
      flex-shrink: ${this.flexShrink};
      align-items: ${this.alignItems};
      justify-content: ${this.justifyContent};
      column-gap: ${this.columnGap && `var(--wui-spacing-${this.columnGap})`};
      row-gap: ${this.rowGap && `var(--wui-spacing-${this.rowGap})`};
      gap: ${this.gap && `var(--wui-spacing-${this.gap})`};
      padding-top: ${this.padding && UiHelperUtil.getSpacingStyles(this.padding, 0)};
      padding-right: ${this.padding && UiHelperUtil.getSpacingStyles(this.padding, 1)};
      padding-bottom: ${this.padding && UiHelperUtil.getSpacingStyles(this.padding, 2)};
      padding-left: ${this.padding && UiHelperUtil.getSpacingStyles(this.padding, 3)};
      margin-top: ${this.margin && UiHelperUtil.getSpacingStyles(this.margin, 0)};
      margin-right: ${this.margin && UiHelperUtil.getSpacingStyles(this.margin, 1)};
      margin-bottom: ${this.margin && UiHelperUtil.getSpacingStyles(this.margin, 2)};
      margin-left: ${this.margin && UiHelperUtil.getSpacingStyles(this.margin, 3)};
    `;
    return b`<slot></slot>`;
  }
};
WuiFlex.styles = [resetStyles, styles$6];
__decorate$6([
  n$1()
], WuiFlex.prototype, "flexDirection", void 0);
__decorate$6([
  n$1()
], WuiFlex.prototype, "flexWrap", void 0);
__decorate$6([
  n$1()
], WuiFlex.prototype, "flexBasis", void 0);
__decorate$6([
  n$1()
], WuiFlex.prototype, "flexGrow", void 0);
__decorate$6([
  n$1()
], WuiFlex.prototype, "flexShrink", void 0);
__decorate$6([
  n$1()
], WuiFlex.prototype, "alignItems", void 0);
__decorate$6([
  n$1()
], WuiFlex.prototype, "justifyContent", void 0);
__decorate$6([
  n$1()
], WuiFlex.prototype, "columnGap", void 0);
__decorate$6([
  n$1()
], WuiFlex.prototype, "rowGap", void 0);
__decorate$6([
  n$1()
], WuiFlex.prototype, "gap", void 0);
__decorate$6([
  n$1()
], WuiFlex.prototype, "padding", void 0);
__decorate$6([
  n$1()
], WuiFlex.prototype, "margin", void 0);
WuiFlex = __decorate$6([
  customElement("wui-flex")
], WuiFlex);
/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
class s {
  constructor(t) {
    this.G = t;
  }
  disconnect() {
    this.G = void 0;
  }
  reconnect(t) {
    this.G = t;
  }
  deref() {
    return this.G;
  }
}
class i {
  constructor() {
    this.Y = void 0, this.Z = void 0;
  }
  get() {
    return this.Y;
  }
  pause() {
    this.Y ?? (this.Y = new Promise((t) => this.Z = t));
  }
  resume() {
    var _a;
    (_a = this.Z) == null ? void 0 : _a.call(this), this.Y = this.Z = void 0;
  }
}
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const n = (t) => !n$2(t) && "function" == typeof t.then, h = 1073741823;
class c extends f {
  constructor() {
    super(...arguments), this._$Cwt = h, this._$Cbt = [], this._$CK = new s(this), this._$CX = new i();
  }
  render(...s2) {
    return s2.find((t) => !n(t)) ?? E;
  }
  update(s2, i2) {
    const e2 = this._$Cbt;
    let r = e2.length;
    this._$Cbt = i2;
    const o = this._$CK, c2 = this._$CX;
    this.isConnected || this.disconnected();
    for (let t = 0; t < i2.length && !(t > this._$Cwt); t++) {
      const s3 = i2[t];
      if (!n(s3)) return this._$Cwt = t, s3;
      t < r && s3 === e2[t] || (this._$Cwt = h, r = 0, Promise.resolve(s3).then(async (t2) => {
        for (; c2.get(); ) await c2.get();
        const i3 = o.deref();
        if (void 0 !== i3) {
          const e3 = i3._$Cbt.indexOf(s3);
          e3 > -1 && e3 < i3._$Cwt && (i3._$Cwt = e3, i3.setValue(t2));
        }
      }));
    }
    return E;
  }
  disconnected() {
    this._$CK.disconnect(), this._$CX.pause();
  }
  reconnected() {
    this._$CK.reconnect(this), this._$CX.resume();
  }
}
const m = e(c);
class CacheUtil {
  constructor() {
    this.cache = /* @__PURE__ */ new Map();
  }
  set(key, value) {
    this.cache.set(key, value);
  }
  get(key) {
    return this.cache.get(key);
  }
  has(key) {
    return this.cache.has(key);
  }
  delete(key) {
    this.cache.delete(key);
  }
  clear() {
    this.cache.clear();
  }
}
const globalSvgCache = new CacheUtil();
const styles$5 = i$1`
  :host {
    display: flex;
    aspect-ratio: var(--local-aspect-ratio);
    color: var(--local-color);
    width: var(--local-width);
  }

  svg {
    width: inherit;
    height: inherit;
    object-fit: contain;
    object-position: center;
  }

  .fallback {
    width: var(--local-width);
    height: var(--local-height);
  }
`;
var __decorate$5 = function(decorators, target, key, desc) {
  var c2 = arguments.length, r = c2 < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
  if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
  else for (var i2 = decorators.length - 1; i2 >= 0; i2--) if (d = decorators[i2]) r = (c2 < 3 ? d(r) : c2 > 3 ? d(target, key, r) : d(target, key)) || r;
  return c2 > 3 && r && Object.defineProperty(target, key, r), r;
};
const ICONS = {
  add: async () => (await import("./add-DAMZBUg3.js")).addSvg,
  allWallets: async () => (await import("./all-wallets-DrQfJN54.js")).allWalletsSvg,
  arrowBottomCircle: async () => (await import("./arrow-bottom-circle-2eXIV-eq.js")).arrowBottomCircleSvg,
  appStore: async () => (await import("./app-store-BEBsCDa5.js")).appStoreSvg,
  apple: async () => (await import("./apple-Dq8k8kXo.js")).appleSvg,
  arrowBottom: async () => (await import("./arrow-bottom-DyJRwq19.js")).arrowBottomSvg,
  arrowLeft: async () => (await import("./arrow-left-BPbbIS1x.js")).arrowLeftSvg,
  arrowRight: async () => (await import("./arrow-right-CvZiT8Iq.js")).arrowRightSvg,
  arrowTop: async () => (await import("./arrow-top-Dfpjv-do.js")).arrowTopSvg,
  bank: async () => (await import("./bank-CsuCnbyo.js")).bankSvg,
  browser: async () => (await import("./browser-BdnoKQD9.js")).browserSvg,
  card: async () => (await import("./card-DOn1J4Gd.js")).cardSvg,
  checkmark: async () => (await import("./checkmark-D6ItERn3.js")).checkmarkSvg,
  checkmarkBold: async () => (await import("./checkmark-bold-CaEu6FDN.js")).checkmarkBoldSvg,
  chevronBottom: async () => (await import("./chevron-bottom-B3Cm4Izo.js")).chevronBottomSvg,
  chevronLeft: async () => (await import("./chevron-left-wQ9EMw_L.js")).chevronLeftSvg,
  chevronRight: async () => (await import("./chevron-right-DhV6hk1B.js")).chevronRightSvg,
  chevronTop: async () => (await import("./chevron-top-svjNJvYQ.js")).chevronTopSvg,
  chromeStore: async () => (await import("./chrome-store-CYt4nrKh.js")).chromeStoreSvg,
  clock: async () => (await import("./clock-C1HVduOm.js")).clockSvg,
  close: async () => (await import("./close-CwmnGn5x.js")).closeSvg,
  compass: async () => (await import("./compass-ZKzoeAd7.js")).compassSvg,
  coinPlaceholder: async () => (await import("./coinPlaceholder-CMDo4mSj.js")).coinPlaceholderSvg,
  copy: async () => (await import("./copy-BM8luBdf.js")).copySvg,
  cursor: async () => (await import("./cursor-C6NnmBF2.js")).cursorSvg,
  cursorTransparent: async () => (await import("./cursor-transparent-jQeEpX8E.js")).cursorTransparentSvg,
  desktop: async () => (await import("./desktop-DXYfHVk3.js")).desktopSvg,
  disconnect: async () => (await import("./disconnect-D4NfgX07.js")).disconnectSvg,
  discord: async () => (await import("./discord-DqcKdsRN.js")).discordSvg,
  etherscan: async () => (await import("./etherscan-B6Dkuk31.js")).etherscanSvg,
  extension: async () => (await import("./extension-BcQcLQEp.js")).extensionSvg,
  externalLink: async () => (await import("./external-link-IWIV3x-m.js")).externalLinkSvg,
  facebook: async () => (await import("./facebook-DEUv0Swk.js")).facebookSvg,
  farcaster: async () => (await import("./farcaster-BbxY_20_.js")).farcasterSvg,
  filters: async () => (await import("./filters-DNxv2FUt.js")).filtersSvg,
  github: async () => (await import("./github-DNLAX3HR.js")).githubSvg,
  google: async () => (await import("./google-C3Z1g87u.js")).googleSvg,
  helpCircle: async () => (await import("./help-circle-Ih9PIMtD.js")).helpCircleSvg,
  image: async () => (await import("./image-DSg22qnp.js")).imageSvg,
  id: async () => (await import("./id-llbkii5E.js")).idSvg,
  infoCircle: async () => (await import("./info-circle-CigaPuW-.js")).infoCircleSvg,
  lightbulb: async () => (await import("./lightbulb-Qx7bpHiy.js")).lightbulbSvg,
  mail: async () => (await import("./mail-ByCDn23s.js")).mailSvg,
  mobile: async () => (await import("./mobile-CRaW-s5j.js")).mobileSvg,
  more: async () => (await import("./more-C0_a6lxO.js")).moreSvg,
  networkPlaceholder: async () => (await import("./network-placeholder-EqKR0HSs.js")).networkPlaceholderSvg,
  nftPlaceholder: async () => (await import("./nftPlaceholder-pmcCsrV7.js")).nftPlaceholderSvg,
  off: async () => (await import("./off-BnpUiRpx.js")).offSvg,
  playStore: async () => (await import("./play-store-BvRAA6uj.js")).playStoreSvg,
  plus: async () => (await import("./plus-B7E6NGNd.js")).plusSvg,
  qrCode: async () => (await import("./qr-code-EDTOPyrL.js")).qrCodeIcon,
  recycleHorizontal: async () => (await import("./recycle-horizontal-FuT6fGkP.js")).recycleHorizontalSvg,
  refresh: async () => (await import("./refresh-BLH2es13.js")).refreshSvg,
  search: async () => (await import("./search-Wb5yZ5xE.js")).searchSvg,
  send: async () => (await import("./send-DxDhZV52.js")).sendSvg,
  swapHorizontal: async () => (await import("./swapHorizontal-DuwktuqC.js")).swapHorizontalSvg,
  swapHorizontalMedium: async () => (await import("./swapHorizontalMedium-CsUt0K-O.js")).swapHorizontalMediumSvg,
  swapHorizontalBold: async () => (await import("./swapHorizontalBold-iPKjGcLU.js")).swapHorizontalBoldSvg,
  swapHorizontalRoundedBold: async () => (await import("./swapHorizontalRoundedBold-hECnlB2y.js")).swapHorizontalRoundedBoldSvg,
  swapVertical: async () => (await import("./swapVertical-CwAXjRN4.js")).swapVerticalSvg,
  telegram: async () => (await import("./telegram-B0bRwhzr.js")).telegramSvg,
  threeDots: async () => (await import("./three-dots-DJEBkeOs.js")).threeDotsSvg,
  twitch: async () => (await import("./twitch-tu6JnOSV.js")).twitchSvg,
  twitter: async () => (await import("./x-BkRRpMgR.js")).xSvg,
  twitterIcon: async () => (await import("./twitterIcon-DDr0AN7T.js")).twitterIconSvg,
  verify: async () => (await import("./verify-CRpwahlv.js")).verifySvg,
  verifyFilled: async () => (await import("./verify-filled-37Yck4oY.js")).verifyFilledSvg,
  wallet: async () => (await import("./wallet-C_T13yy7.js")).walletSvg,
  walletConnect: async () => (await import("./walletconnect-Cys5XIYC.js")).walletConnectSvg,
  walletConnectLightBrown: async () => (await import("./walletconnect-Cys5XIYC.js")).walletConnectLightBrownSvg,
  walletConnectBrown: async () => (await import("./walletconnect-Cys5XIYC.js")).walletConnectBrownSvg,
  walletPlaceholder: async () => (await import("./wallet-placeholder-NKB3z66t.js")).walletPlaceholderSvg,
  warningCircle: async () => (await import("./warning-circle-Dh0ju3wn.js")).warningCircleSvg,
  x: async () => (await import("./x-BkRRpMgR.js")).xSvg,
  info: async () => (await import("./info-DKWaQz3V.js")).infoSvg,
  exclamationTriangle: async () => (await import("./exclamation-triangle-DPR_hOjG.js")).exclamationTriangleSvg,
  reown: async () => (await import("./reown-logo-Bob8oohw.js")).reownSvg
};
async function getSvg(name) {
  if (globalSvgCache.has(name)) {
    return globalSvgCache.get(name);
  }
  const importFn = ICONS[name] ?? ICONS.copy;
  const svgPromise = importFn();
  globalSvgCache.set(name, svgPromise);
  return svgPromise;
}
let WuiIcon = class WuiIcon2 extends i$2 {
  constructor() {
    super(...arguments);
    this.size = "md";
    this.name = "copy";
    this.color = "fg-300";
    this.aspectRatio = "1 / 1";
  }
  render() {
    this.style.cssText = `
      --local-color: ${`var(--wui-color-${this.color});`}
      --local-width: ${`var(--wui-icon-size-${this.size});`}
      --local-aspect-ratio: ${this.aspectRatio}
    `;
    return b`${m(getSvg(this.name), b`<div class="fallback"></div>`)}`;
  }
};
WuiIcon.styles = [resetStyles, colorStyles, styles$5];
__decorate$5([
  n$1()
], WuiIcon.prototype, "size", void 0);
__decorate$5([
  n$1()
], WuiIcon.prototype, "name", void 0);
__decorate$5([
  n$1()
], WuiIcon.prototype, "color", void 0);
__decorate$5([
  n$1()
], WuiIcon.prototype, "aspectRatio", void 0);
WuiIcon = __decorate$5([
  customElement("wui-icon")
], WuiIcon);
const styles$4 = i$1`
  :host {
    display: inline-flex !important;
  }

  slot {
    width: 100%;
    display: inline-block;
    font-style: normal;
    font-family: var(--wui-font-family);
    font-feature-settings:
      'tnum' on,
      'lnum' on,
      'case' on;
    line-height: 130%;
    font-weight: var(--wui-font-weight-regular);
    overflow: inherit;
    text-overflow: inherit;
    text-align: var(--local-align);
    color: var(--local-color);
  }

  .wui-line-clamp-1 {
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
  }

  .wui-line-clamp-2 {
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .wui-font-medium-400 {
    font-size: var(--wui-font-size-medium);
    font-weight: var(--wui-font-weight-light);
    letter-spacing: var(--wui-letter-spacing-medium);
  }

  .wui-font-medium-600 {
    font-size: var(--wui-font-size-medium);
    letter-spacing: var(--wui-letter-spacing-medium);
  }

  .wui-font-title-600 {
    font-size: var(--wui-font-size-title);
    letter-spacing: var(--wui-letter-spacing-title);
  }

  .wui-font-title-6-600 {
    font-size: var(--wui-font-size-title-6);
    letter-spacing: var(--wui-letter-spacing-title-6);
  }

  .wui-font-mini-700 {
    font-size: var(--wui-font-size-mini);
    letter-spacing: var(--wui-letter-spacing-mini);
    text-transform: uppercase;
  }

  .wui-font-large-500,
  .wui-font-large-600,
  .wui-font-large-700 {
    font-size: var(--wui-font-size-large);
    letter-spacing: var(--wui-letter-spacing-large);
  }

  .wui-font-2xl-500,
  .wui-font-2xl-600,
  .wui-font-2xl-700 {
    font-size: var(--wui-font-size-2xl);
    letter-spacing: var(--wui-letter-spacing-2xl);
  }

  .wui-font-paragraph-400,
  .wui-font-paragraph-500,
  .wui-font-paragraph-600,
  .wui-font-paragraph-700 {
    font-size: var(--wui-font-size-paragraph);
    letter-spacing: var(--wui-letter-spacing-paragraph);
  }

  .wui-font-small-400,
  .wui-font-small-500,
  .wui-font-small-600 {
    font-size: var(--wui-font-size-small);
    letter-spacing: var(--wui-letter-spacing-small);
  }

  .wui-font-tiny-400,
  .wui-font-tiny-500,
  .wui-font-tiny-600 {
    font-size: var(--wui-font-size-tiny);
    letter-spacing: var(--wui-letter-spacing-tiny);
  }

  .wui-font-micro-700,
  .wui-font-micro-600 {
    font-size: var(--wui-font-size-micro);
    letter-spacing: var(--wui-letter-spacing-micro);
    text-transform: uppercase;
  }

  .wui-font-tiny-400,
  .wui-font-small-400,
  .wui-font-medium-400,
  .wui-font-paragraph-400 {
    font-weight: var(--wui-font-weight-light);
  }

  .wui-font-large-700,
  .wui-font-paragraph-700,
  .wui-font-micro-700,
  .wui-font-mini-700 {
    font-weight: var(--wui-font-weight-bold);
  }

  .wui-font-medium-600,
  .wui-font-medium-title-600,
  .wui-font-title-6-600,
  .wui-font-large-600,
  .wui-font-paragraph-600,
  .wui-font-small-600,
  .wui-font-tiny-600,
  .wui-font-micro-600 {
    font-weight: var(--wui-font-weight-medium);
  }

  :host([disabled]) {
    opacity: 0.4;
  }
`;
var __decorate$4 = function(decorators, target, key, desc) {
  var c2 = arguments.length, r = c2 < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
  if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
  else for (var i2 = decorators.length - 1; i2 >= 0; i2--) if (d = decorators[i2]) r = (c2 < 3 ? d(r) : c2 > 3 ? d(target, key, r) : d(target, key)) || r;
  return c2 > 3 && r && Object.defineProperty(target, key, r), r;
};
let WuiText = class WuiText2 extends i$2 {
  constructor() {
    super(...arguments);
    this.variant = "paragraph-500";
    this.color = "fg-300";
    this.align = "left";
    this.lineClamp = void 0;
  }
  render() {
    const classes = {
      [`wui-font-${this.variant}`]: true,
      [`wui-color-${this.color}`]: true,
      [`wui-line-clamp-${this.lineClamp}`]: this.lineClamp ? true : false
    };
    this.style.cssText = `
      --local-align: ${this.align};
      --local-color: var(--wui-color-${this.color});
    `;
    return b`<slot class=${e$1(classes)}></slot>`;
  }
};
WuiText.styles = [resetStyles, styles$4];
__decorate$4([
  n$1()
], WuiText.prototype, "variant", void 0);
__decorate$4([
  n$1()
], WuiText.prototype, "color", void 0);
__decorate$4([
  n$1()
], WuiText.prototype, "align", void 0);
__decorate$4([
  n$1()
], WuiText.prototype, "lineClamp", void 0);
WuiText = __decorate$4([
  customElement("wui-text")
], WuiText);
const styles$3 = i$1`
  :host {
    display: inline-flex;
    justify-content: center;
    align-items: center;
    position: relative;
    overflow: hidden;
    background-color: var(--wui-color-gray-glass-020);
    border-radius: var(--local-border-radius);
    border: var(--local-border);
    box-sizing: content-box;
    width: var(--local-size);
    height: var(--local-size);
    min-height: var(--local-size);
    min-width: var(--local-size);
  }

  @supports (background: color-mix(in srgb, white 50%, black)) {
    :host {
      background-color: color-mix(in srgb, var(--local-bg-value) var(--local-bg-mix), transparent);
    }
  }
`;
var __decorate$3 = function(decorators, target, key, desc) {
  var c2 = arguments.length, r = c2 < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
  if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
  else for (var i2 = decorators.length - 1; i2 >= 0; i2--) if (d = decorators[i2]) r = (c2 < 3 ? d(r) : c2 > 3 ? d(target, key, r) : d(target, key)) || r;
  return c2 > 3 && r && Object.defineProperty(target, key, r), r;
};
let WuiIconBox = class WuiIconBox2 extends i$2 {
  constructor() {
    super(...arguments);
    this.size = "md";
    this.backgroundColor = "accent-100";
    this.iconColor = "accent-100";
    this.background = "transparent";
    this.border = false;
    this.borderColor = "wui-color-bg-125";
    this.icon = "copy";
  }
  render() {
    const iconSize = this.iconSize || this.size;
    const isLg = this.size === "lg";
    const isXl = this.size === "xl";
    const bgMix = isLg ? "12%" : "16%";
    const borderRadius = isLg ? "xxs" : isXl ? "s" : "3xl";
    const isGray = this.background === "gray";
    const isOpaque = this.background === "opaque";
    const isColorChange = this.backgroundColor === "accent-100" && isOpaque || this.backgroundColor === "success-100" && isOpaque || this.backgroundColor === "error-100" && isOpaque || this.backgroundColor === "inverse-100" && isOpaque;
    let bgValueVariable = `var(--wui-color-${this.backgroundColor})`;
    if (isColorChange) {
      bgValueVariable = `var(--wui-icon-box-bg-${this.backgroundColor})`;
    } else if (isGray) {
      bgValueVariable = `var(--wui-color-gray-${this.backgroundColor})`;
    }
    this.style.cssText = `
       --local-bg-value: ${bgValueVariable};
       --local-bg-mix: ${isColorChange || isGray ? `100%` : bgMix};
       --local-border-radius: var(--wui-border-radius-${borderRadius});
       --local-size: var(--wui-icon-box-size-${this.size});
       --local-border: ${this.borderColor === "wui-color-bg-125" ? `2px` : `1px`} solid ${this.border ? `var(--${this.borderColor})` : `transparent`}
   `;
    return b` <wui-icon color=${this.iconColor} size=${iconSize} name=${this.icon}></wui-icon> `;
  }
};
WuiIconBox.styles = [resetStyles, elementStyles, styles$3];
__decorate$3([
  n$1()
], WuiIconBox.prototype, "size", void 0);
__decorate$3([
  n$1()
], WuiIconBox.prototype, "backgroundColor", void 0);
__decorate$3([
  n$1()
], WuiIconBox.prototype, "iconColor", void 0);
__decorate$3([
  n$1()
], WuiIconBox.prototype, "iconSize", void 0);
__decorate$3([
  n$1()
], WuiIconBox.prototype, "background", void 0);
__decorate$3([
  n$1({ type: Boolean })
], WuiIconBox.prototype, "border", void 0);
__decorate$3([
  n$1()
], WuiIconBox.prototype, "borderColor", void 0);
__decorate$3([
  n$1()
], WuiIconBox.prototype, "icon", void 0);
WuiIconBox = __decorate$3([
  customElement("wui-icon-box")
], WuiIconBox);
const styles$2 = i$1`
  :host {
    display: block;
    width: var(--local-width);
    height: var(--local-height);
  }

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center center;
    border-radius: inherit;
  }
`;
var __decorate$2 = function(decorators, target, key, desc) {
  var c2 = arguments.length, r = c2 < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
  if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
  else for (var i2 = decorators.length - 1; i2 >= 0; i2--) if (d = decorators[i2]) r = (c2 < 3 ? d(r) : c2 > 3 ? d(target, key, r) : d(target, key)) || r;
  return c2 > 3 && r && Object.defineProperty(target, key, r), r;
};
let WuiImage = class WuiImage2 extends i$2 {
  constructor() {
    super(...arguments);
    this.src = "./path/to/image.jpg";
    this.alt = "Image";
    this.size = void 0;
  }
  render() {
    this.style.cssText = `
      --local-width: ${this.size ? `var(--wui-icon-size-${this.size});` : "100%"};
      --local-height: ${this.size ? `var(--wui-icon-size-${this.size});` : "100%"};
      `;
    return b`<img src=${this.src} alt=${this.alt} @error=${this.handleImageError} />`;
  }
  handleImageError() {
    this.dispatchEvent(new CustomEvent("onLoadError", { bubbles: true, composed: true }));
  }
};
WuiImage.styles = [resetStyles, colorStyles, styles$2];
__decorate$2([
  n$1()
], WuiImage.prototype, "src", void 0);
__decorate$2([
  n$1()
], WuiImage.prototype, "alt", void 0);
__decorate$2([
  n$1()
], WuiImage.prototype, "size", void 0);
WuiImage = __decorate$2([
  customElement("wui-image")
], WuiImage);
const styles$1 = i$1`
  :host {
    display: flex;
    justify-content: center;
    align-items: center;
    height: var(--wui-spacing-m);
    padding: 0 var(--wui-spacing-3xs) !important;
    border-radius: var(--wui-border-radius-5xs);
    transition:
      border-radius var(--wui-duration-lg) var(--wui-ease-out-power-1),
      background-color var(--wui-duration-lg) var(--wui-ease-out-power-1);
    will-change: border-radius, background-color;
  }

  :host > wui-text {
    transform: translateY(5%);
  }

  :host([data-variant='main']) {
    background-color: var(--wui-color-accent-glass-015);
    color: var(--wui-color-accent-100);
  }

  :host([data-variant='shade']) {
    background-color: var(--wui-color-gray-glass-010);
    color: var(--wui-color-fg-200);
  }

  :host([data-variant='success']) {
    background-color: var(--wui-icon-box-bg-success-100);
    color: var(--wui-color-success-100);
  }

  :host([data-variant='error']) {
    background-color: var(--wui-icon-box-bg-error-100);
    color: var(--wui-color-error-100);
  }

  :host([data-size='lg']) {
    padding: 11px 5px !important;
  }

  :host([data-size='lg']) > wui-text {
    transform: translateY(2%);
  }
`;
var __decorate$1 = function(decorators, target, key, desc) {
  var c2 = arguments.length, r = c2 < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
  if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
  else for (var i2 = decorators.length - 1; i2 >= 0; i2--) if (d = decorators[i2]) r = (c2 < 3 ? d(r) : c2 > 3 ? d(target, key, r) : d(target, key)) || r;
  return c2 > 3 && r && Object.defineProperty(target, key, r), r;
};
let WuiTag = class WuiTag2 extends i$2 {
  constructor() {
    super(...arguments);
    this.variant = "main";
    this.size = "lg";
  }
  render() {
    this.dataset["variant"] = this.variant;
    this.dataset["size"] = this.size;
    const textVariant = this.size === "md" ? "mini-700" : "micro-700";
    return b`
      <wui-text data-variant=${this.variant} variant=${textVariant} color="inherit">
        <slot></slot>
      </wui-text>
    `;
  }
};
WuiTag.styles = [resetStyles, styles$1];
__decorate$1([
  n$1()
], WuiTag.prototype, "variant", void 0);
__decorate$1([
  n$1()
], WuiTag.prototype, "size", void 0);
WuiTag = __decorate$1([
  customElement("wui-tag")
], WuiTag);
const styles = i$1`
  :host {
    display: flex;
  }

  :host([data-size='sm']) > svg {
    width: 12px;
    height: 12px;
  }

  :host([data-size='md']) > svg {
    width: 16px;
    height: 16px;
  }

  :host([data-size='lg']) > svg {
    width: 24px;
    height: 24px;
  }

  :host([data-size='xl']) > svg {
    width: 32px;
    height: 32px;
  }

  svg {
    animation: rotate 2s linear infinite;
  }

  circle {
    fill: none;
    stroke: var(--local-color);
    stroke-width: 4px;
    stroke-dasharray: 1, 124;
    stroke-dashoffset: 0;
    stroke-linecap: round;
    animation: dash 1.5s ease-in-out infinite;
  }

  :host([data-size='md']) > svg > circle {
    stroke-width: 6px;
  }

  :host([data-size='sm']) > svg > circle {
    stroke-width: 8px;
  }

  @keyframes rotate {
    100% {
      transform: rotate(360deg);
    }
  }

  @keyframes dash {
    0% {
      stroke-dasharray: 1, 124;
      stroke-dashoffset: 0;
    }

    50% {
      stroke-dasharray: 90, 124;
      stroke-dashoffset: -35;
    }

    100% {
      stroke-dashoffset: -125;
    }
  }
`;
var __decorate = function(decorators, target, key, desc) {
  var c2 = arguments.length, r = c2 < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
  if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
  else for (var i2 = decorators.length - 1; i2 >= 0; i2--) if (d = decorators[i2]) r = (c2 < 3 ? d(r) : c2 > 3 ? d(target, key, r) : d(target, key)) || r;
  return c2 > 3 && r && Object.defineProperty(target, key, r), r;
};
let WuiLoadingSpinner = class WuiLoadingSpinner2 extends i$2 {
  constructor() {
    super(...arguments);
    this.color = "accent-100";
    this.size = "lg";
  }
  render() {
    this.style.cssText = `--local-color: ${this.color === "inherit" ? "inherit" : `var(--wui-color-${this.color})`}`;
    this.dataset["size"] = this.size;
    return b`<svg viewBox="25 25 50 50">
      <circle r="20" cy="50" cx="50"></circle>
    </svg>`;
  }
};
WuiLoadingSpinner.styles = [resetStyles, styles];
__decorate([
  n$1()
], WuiLoadingSpinner.prototype, "color", void 0);
__decorate([
  n$1()
], WuiLoadingSpinner.prototype, "size", void 0);
WuiLoadingSpinner = __decorate([
  customElement("wui-loading-spinner")
], WuiLoadingSpinner);
export {
  UiHelperUtil as U,
  customElement as c
};
