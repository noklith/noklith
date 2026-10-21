import { k as css, r as resetStyles, l as elementStyles, m as i, N as NumberUtil, n as b } from "./appkit-DSMu6gPS.js";
import { n, r } from "./class-map-8z_gfTFE.js";
import { c as customElement } from "./index-Ct0FqwRl.js";
import "./index-Dn1QLri1.js";
const styles = css`
  :host {
    width: 100%;
  }

  button {
    padding: ${({ spacing }) => spacing[3]};
    display: flex;
    gap: ${({ spacing }) => spacing[3]};
    justify-content: space-between;
    width: 100%;
    border-radius: ${({ borderRadius }) => borderRadius[4]};
    background-color: transparent;
  }

  @media (hover: hover) {
    button:hover:enabled {
      background-color: ${({ tokens }) => tokens.theme.foregroundSecondary};
    }
  }

  button:focus-visible:enabled {
    background-color: ${({ tokens }) => tokens.theme.foregroundSecondary};
    box-shadow: 0 0 0 4px ${({ tokens }) => tokens.core.foregroundAccent040};
  }

  button[data-clickable='false'] {
    pointer-events: none;
    background-color: transparent;
  }

  wui-image,
  wui-icon {
    width: ${({ spacing }) => spacing[10]};
    height: ${({ spacing }) => spacing[10]};
  }

  wui-image {
    border-radius: ${({ borderRadius }) => borderRadius[16]};
  }

  .token-name-container {
    flex: 1;
  }
`;
var __decorate = function(decorators, target, key, desc) {
  var c = arguments.length, r2 = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
  if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r2 = Reflect.decorate(decorators, target, key, desc);
  else for (var i2 = decorators.length - 1; i2 >= 0; i2--) if (d = decorators[i2]) r2 = (c < 3 ? d(r2) : c > 3 ? d(target, key, r2) : d(target, key)) || r2;
  return c > 3 && r2 && Object.defineProperty(target, key, r2), r2;
};
let WuiListToken = class WuiListToken2 extends i {
  constructor() {
    super(...arguments);
    this.tokenName = "";
    this.tokenImageUrl = "";
    this.tokenValue = 0;
    this.tokenAmount = "0.0";
    this.tokenCurrency = "";
    this.clickable = false;
    this.imageError = false;
  }
  render() {
    return b`
      <button data-clickable=${String(this.clickable)}>
        <wui-flex gap="2" alignItems="center">
          ${this.visualTemplate()}
          <wui-flex
            flexDirection="column"
            justifyContent="space-between"
            gap="1"
            class="token-name-container"
          >
            <wui-text variant="md-regular" color="primary" lineClamp="1">
              ${this.tokenName}
            </wui-text>
            <wui-text variant="sm-regular-mono" color="secondary">
              ${NumberUtil.formatNumberToLocalString(this.tokenAmount, 4)} ${this.tokenCurrency}
            </wui-text>
          </wui-flex>
        </wui-flex>
        <wui-flex
          flexDirection="column"
          justifyContent="space-between"
          gap="1"
          alignItems="flex-end"
          width="auto"
        >
          <wui-text variant="md-regular-mono" color="primary"
            >$${this.tokenValue.toFixed(2)}</wui-text
          >
          <wui-text variant="sm-regular-mono" color="secondary">
            ${NumberUtil.formatNumberToLocalString(this.tokenAmount, 4)}
          </wui-text>
        </wui-flex>
      </button>
    `;
  }
  updated(changedProperties) {
    if (changedProperties.has("tokenImageUrl")) {
      this.imageError = false;
    }
  }
  visualTemplate() {
    if (this.tokenName && this.tokenImageUrl && !this.imageError) {
      return b`<wui-image
        alt=${this.tokenName}
        src=${this.tokenImageUrl}
        @onLoadError=${this.handleImageError}
      ></wui-image>`;
    }
    return b`<wui-icon name="coinPlaceholder" color="default"></wui-icon>`;
  }
  handleImageError() {
    this.imageError = true;
  }
};
WuiListToken.styles = [resetStyles, elementStyles, styles];
__decorate([
  n()
], WuiListToken.prototype, "tokenName", void 0);
__decorate([
  n()
], WuiListToken.prototype, "tokenImageUrl", void 0);
__decorate([
  n({ type: Number })
], WuiListToken.prototype, "tokenValue", void 0);
__decorate([
  n()
], WuiListToken.prototype, "tokenAmount", void 0);
__decorate([
  n()
], WuiListToken.prototype, "tokenCurrency", void 0);
__decorate([
  n({ type: Boolean })
], WuiListToken.prototype, "clickable", void 0);
__decorate([
  r()
], WuiListToken.prototype, "imageError", void 0);
WuiListToken = __decorate([
  customElement("wui-list-token")
], WuiListToken);
