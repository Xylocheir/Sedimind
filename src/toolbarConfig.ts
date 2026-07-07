import type { LLMChatSettings } from "./settings";
import { DEFAULT_TOOLBAR_MAIN_ORDER, DEFAULT_TOOLBAR_SUBMENU_IDS } from "./settings";

export type ToolbarGroup = "texttool" | "ai" | "main" | "sub";
export type ToolbarOp =
  | "bold" | "italic" | "underline" | "strike" | "highlight"
  | "sup" | "sub" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
  | "ol" | "ul" | "task" | "table" | "file" | "math";
export type ToolbarAction = "ai" | "translate" | "ref" | "copy" | "settings";

export interface ToolbarButtonDef {
  id: string;
  group: ToolbarGroup;
  icon: string;
  label: string;
  kind: "submenu" | "action" | "format";
  action?: ToolbarAction;
  op?: ToolbarOp;
}

// 图标均取自 src/assets（Pixso 14x14 风格），构建期内联为 currentColor
const ICN: Record<string, string> = {
  texttool: "<svg viewBox=\"0 0 14 14\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"14\" height=\"14\" fill=\"none\" customFrame=\"#000000\">\n\t<defs>\n\t\t<clipPath id=\"clipPath_12\">\n\t\t\t<rect width=\"14.000000\" height=\"14.000000\" x=\"0.000000\" y=\"0.000000\" fill=\"rgb(255,255,255)\" />\n\t\t</clipPath>\n\t</defs>\n\t<g id=\"Toolbar-texttool\">\n\t\t<g id=\"type 1\" clip-path=\"url(#clipPath_12)\" customFrame=\"url(#clipPath_12)\">\n\t\t\t<rect id=\"type 1\" width=\"14.000000\" height=\"14.000000\" x=\"0.000000\" y=\"0.000000\" />\n\t\t\t<path id=\"矢量 4949\" d=\"M7 2.33333L7 11.6667\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.166667\" />\n\t\t\t<path id=\"矢量 4950\" d=\"M2.3335 4.08333L2.3335 2.91666C2.3335 2.81427 2.36045 2.71367 2.41165 2.62499C2.46285 2.53632 2.53648 2.46268 2.62516 2.41148C2.71384 2.36028 2.81443 2.33333 2.91683 2.33333L11.0835 2.33333C11.1859 2.33333 11.2865 2.36028 11.3752 2.41148C11.4638 2.46268 11.5375 2.53632 11.5887 2.62499C11.6399 2.71367 11.6668 2.81427 11.6668 2.91666L11.6668 4.08333\" fill-rule=\"nonzero\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.166667\" />\n\t\t\t<path id=\"矢量 4951\" d=\"M5.25 11.6667L8.75 11.6667\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.166667\" />\n\t\t</g>\n\t</g>\n</svg>",
  ai: "<svg viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"14\" height=\"14\" fill=\"none\"><rect id=\"矩形 86\" width=\"12.000000\" height=\"20.000000\" x=\"6.000000\" y=\"2.000000\" rx=\"2.000000\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" /><rect id=\"矩形 87\" width=\"20.000000\" height=\"12.000000\" x=\"2.000000\" y=\"6.000000\" rx=\"2.000000\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" /></svg>",
  translate: "<svg viewBox=\"0 0 14 14\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"14\" height=\"14\" fill=\"none\" customFrame=\"#000000\">\n\t<defs>\n\t\t<clipPath id=\"clipPath_11\">\n\t\t\t<rect width=\"14.000000\" height=\"14.000000\" x=\"0.000000\" y=\"0.000000\" fill=\"rgb(255,255,255)\" />\n\t\t</clipPath>\n\t</defs>\n\t<g id=\"Toolbar-translate\">\n\t\t<g id=\"languages 1\" clip-path=\"url(#clipPath_11)\" customFrame=\"url(#clipPath_11)\">\n\t\t\t<rect id=\"languages 1\" width=\"14.000000\" height=\"14.000000\" x=\"0.000000\" y=\"0.000000\" />\n\t\t\t<path id=\"矢量 4767\" d=\"M2.9165 4.66667L6.4165 8.16667\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.166667\" />\n\t\t\t<path id=\"矢量 4768\" d=\"M2.3335 8.16667L5.8335 4.66667L7.00016 2.91667\" fill-rule=\"nonzero\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.166667\" />\n\t\t\t<path id=\"矢量 4769\" d=\"M1.1665 2.91667L8.1665 2.91667\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.166667\" />\n\t\t\t<path id=\"矢量 4770\" d=\"M4.0835 1.16667L4.66683 1.16667\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.166667\" />\n\t\t\t<path id=\"矢量 4771\" d=\"M12.8333 12.8333L9.91667 7L7 12.8333\" fill-rule=\"nonzero\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.166667\" />\n\t\t\t<path id=\"矢量 4772\" d=\"M8.1665 10.5L11.6665 10.5\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.166667\" />\n\t\t</g>\n\t</g>\n</svg>",
  ref: "<svg viewBox=\"0 0 15.2729 15.2727\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"14\" height=\"14\" fill=\"none\">\n\t<rect id=\"at-sign 1\" width=\"15.272728\" height=\"15.272728\" x=\"0.000000\" y=\"0.000000\" />\n\t<g id=\"组合 97\">\n\t\t<path id=\"椭圆 12(边框)\" d=\"M6.42331 10.5647C6.79569 10.719 7.2 10.7961 7.63627 10.7961C8.07253 10.7961 8.47685 10.719 8.84922 10.5647C9.2216 10.4105 9.56203 10.1791 9.87052 9.87064C10.179 9.56215 10.4104 9.22172 10.5646 8.84935C10.7189 8.47697 10.796 8.07265 10.796 7.63639C10.796 7.20013 10.7189 6.79581 10.5646 6.42343C10.4104 6.05106 10.179 5.71063 9.87052 5.40214C9.56203 5.09365 9.2216 4.86229 8.84922 4.70805C8.47685 4.55381 8.07253 4.47668 7.63627 4.47668C7.2 4.47668 6.79568 4.55381 6.42331 4.70805C6.05093 4.86229 5.7105 5.09366 5.40202 5.40214C5.09353 5.71063 4.86217 6.05106 4.70793 6.42343C4.55368 6.79581 4.47656 7.20013 4.47656 7.63639C4.47656 8.07265 4.55368 8.47697 4.70793 8.84935C4.86217 9.22172 5.09353 9.56215 5.40202 9.87064C5.71051 10.1791 6.05094 10.4105 6.42331 10.5647ZM8.37763 9.42618C8.15003 9.52046 7.90291 9.56759 7.63627 9.56759C7.36962 9.56759 7.1225 9.52046 6.89491 9.42618C6.66732 9.33191 6.45925 9.1905 6.2707 9.00196C6.08215 8.81341 5.94075 8.60534 5.84647 8.37775C5.7522 8.15015 5.70506 7.90303 5.70506 7.63639C5.70506 7.36975 5.7522 7.12263 5.84647 6.89503C5.94075 6.66744 6.08216 6.45937 6.2707 6.27082C6.45925 6.08228 6.66732 5.94087 6.89491 5.84659C7.12251 5.75232 7.36962 5.70519 7.63627 5.70519C7.90291 5.70519 8.15003 5.75232 8.37763 5.8466C8.60522 5.94087 8.81329 6.08228 9.00183 6.27082C9.19038 6.45937 9.33179 6.66744 9.42606 6.89503C9.52034 7.12263 9.56747 7.36975 9.56747 7.63639C9.56747 7.90303 9.52034 8.15015 9.42606 8.37775C9.33179 8.60534 9.19038 8.81341 9.00183 9.00196C8.81329 9.1905 8.60522 9.33191 8.37763 9.42618Z\" fill=\"rgb(0,0,0)\" fill-rule=\"evenodd\" />\n\t\t<path id=\"矢量 4750(边框)\" d=\"M10.796 8.27272L10.796 5.0909L10.7959 5.08285C10.7949 4.98617 10.7741 4.89763 10.7337 4.81723C10.6745 4.69592 10.5768 4.59814 10.4554 4.53899C10.3737 4.49785 10.2834 4.47707 10.1848 4.47666L10.1817 4.47665L10.1815 4.47665C10.0818 4.47668 9.99061 4.49746 9.90804 4.53898C9.78673 4.59814 9.68894 4.69592 9.6298 4.81724C9.58894 4.8985 9.56818 4.98809 9.56751 5.086L9.56749 5.0909L9.56749 8.27272C9.56749 8.54601 9.60765 8.80625 9.68796 9.05344C9.76828 9.30064 9.88876 9.5348 10.0494 9.7559C10.2101 9.97701 10.3955 10.164 10.6058 10.3167C10.8161 10.4695 11.0512 10.5881 11.3111 10.6726C11.571 10.757 11.8309 10.7992 12.0908 10.7992C12.3508 10.7992 12.6107 10.757 12.8706 10.6726C13.1305 10.5881 13.3656 10.4695 13.5759 10.3167C13.7862 10.1639 13.9716 9.97701 14.1323 9.7559C14.2929 9.5348 14.4134 9.30064 14.4937 9.05343C14.574 8.80624 14.6142 8.54601 14.6142 8.27272L14.6142 7.63636C14.6142 6.92309 14.5142 6.24048 14.3143 5.58852C14.1144 4.93657 13.8145 4.31527 13.4146 3.72462C13.0148 3.13397 12.5493 2.62475 12.0183 2.19694C11.4873 1.76914 10.8906 1.42275 10.2284 1.15779C9.56618 0.892832 8.89529 0.732068 8.21572 0.675499C7.53615 0.61893 6.8479 0.666559 6.15098 0.818384C5.45406 0.970208 4.80838 1.21318 4.21392 1.54729C3.61946 1.88141 3.07622 2.30668 2.58422 2.82309C2.09222 3.3395 1.69373 3.90268 1.38877 4.51261C1.0838 5.12254 0.87236 5.77922 0.754433 6.48267C0.636506 7.18611 0.622233 7.87585 0.711612 8.55188C0.800993 9.22792 0.99403 9.89026 1.29072 10.5389C1.58741 11.1875 1.96226 11.7667 2.41526 12.2764C2.86825 12.7861 3.3994 13.2264 4.0087 13.5972C4.61801 13.968 5.25311 14.2375 5.91398 14.4056C6.57484 14.5738 7.26148 14.6406 7.9739 14.6061C8.68633 14.5716 9.3633 14.4387 10.0048 14.2075C10.6463 13.9762 11.2524 13.6466 11.823 13.2187C11.8236 13.2183 11.8241 13.2179 11.8246 13.2175C11.9037 13.1578 11.9637 13.0869 12.0046 13.0046C12.0661 12.8845 12.0857 12.7476 12.0602 12.6151C12.0441 12.525 12.0065 12.4403 11.9477 12.3611C11.9471 12.3603 11.9465 12.3595 11.9459 12.3587C11.7988 12.1626 11.5645 12.0788 11.3423 12.1215C11.2513 12.1378 11.1658 12.176 11.0859 12.2359C10.6158 12.5885 10.1164 12.8601 9.58782 13.0506C9.05925 13.2411 8.50146 13.3506 7.91446 13.379C7.32747 13.4074 6.76171 13.3524 6.2172 13.2139C5.67268 13.0753 5.1494 12.8533 4.64736 12.5478C4.14533 12.2422 3.70769 11.8795 3.33445 11.4595C2.9612 11.0395 2.65236 10.5623 2.4079 10.0279C2.16344 9.49345 2.00439 8.94772 1.93075 8.3907C1.8571 7.83369 1.86886 7.26538 1.96603 6.68578C2.06319 6.10618 2.23741 5.56511 2.48868 5.06257C2.73996 4.56002 3.06829 4.09599 3.47367 3.6705C3.87905 3.245 4.32665 2.89461 4.81645 2.61931C5.30625 2.34402 5.83826 2.14383 6.41248 2.01873C6.9867 1.89364 7.55377 1.85439 8.1137 1.901C8.67363 1.94761 9.22641 2.08007 9.77205 2.29838C10.3177 2.5167 10.8093 2.8021 11.2468 3.15458C11.6844 3.50707 12.0679 3.92664 12.3973 4.41331C12.7268 4.89997 12.9739 5.41189 13.1386 5.94907C13.3033 6.48624 13.3857 7.04867 13.3857 7.63636L13.3857 8.27272C13.3857 8.41295 13.3651 8.54649 13.3239 8.67333C13.2826 8.80019 13.2208 8.92035 13.1384 9.03381C13.0559 9.14727 12.9608 9.24321 12.8529 9.32161C12.745 9.39999 12.6243 9.46086 12.491 9.50419C12.3576 9.54752 12.2242 9.56919 12.0908 9.56919C11.9575 9.56919 11.8241 9.54752 11.6907 9.50419C11.5573 9.46085 11.4367 9.39999 11.3288 9.32159C11.2209 9.24319 11.1257 9.14727 11.0433 9.03381C10.9608 8.92035 10.899 8.80018 10.8578 8.67333C10.8166 8.54649 10.796 8.41295 10.796 8.27272Z\" fill=\"rgb(0,0,0)\" fill-rule=\"evenodd\" />\n\t</g>\n</svg>",
  copy: "<svg viewBox=\"0 0 14 14\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"14\" height=\"14\" fill=\"none\" customFrame=\"#000000\">\n\t<defs>\n\t\t<clipPath id=\"clipPath_8\">\n\t\t\t<rect width=\"14.000000\" height=\"14.000000\" x=\"0.000000\" y=\"0.000000\" fill=\"rgb(255,255,255)\" />\n\t\t</clipPath>\n\t</defs>\n\t<g id=\"Toolbar-copy\">\n\t\t<g id=\"copy 1\" clip-path=\"url(#clipPath_8)\" customFrame=\"url(#clipPath_8)\">\n\t\t\t<rect id=\"copy 1\" width=\"14.000000\" height=\"14.000000\" x=\"0.000000\" y=\"0.000000\" />\n\t\t\t<rect id=\"矩形 42\" width=\"8.166666\" height=\"8.166666\" x=\"4.666504\" y=\"4.666672\" rx=\"1.166667\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.166667\" />\n\t\t\t<path id=\"矢量 5255\" d=\"M2.33317 9.33334C1.6915 9.33334 1.1665 8.80834 1.1665 8.16667L1.1665 2.33334C1.1665 1.69167 1.6915 1.16667 2.33317 1.16667L8.1665 1.16667C8.80817 1.16667 9.33317 1.69167 9.33317 2.33334\" fill-rule=\"nonzero\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.166667\" />\n\t\t</g>\n\t</g>\n</svg>",
  settings: "<svg viewBox=\"0 0 14 14\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"14\" height=\"14\" fill=\"none\" customFrame=\"#000000\">\n\t<defs>\n\t\t<clipPath id=\"clipPath_7\">\n\t\t\t<rect width=\"14.000000\" height=\"14.000000\" x=\"0.000000\" y=\"0.000000\" fill=\"rgb(255,255,255)\" />\n\t\t</clipPath>\n\t</defs>\n\t<g id=\"Toolbar-Settings\">\n\t\t<g id=\"settings-2 1 1\" clip-path=\"url(#clipPath_7)\" customFrame=\"url(#clipPath_7)\">\n\t\t\t<rect id=\"settings-2 1 1\" width=\"14.000000\" height=\"14.000000\" x=\"0.000000\" y=\"0.000000\" />\n\t\t\t<rect id=\"settings-2 1\" width=\"14.000000\" height=\"14.000000\" x=\"0.000000\" y=\"0.000000\" />\n\t\t\t<path id=\"矢量 4751(边框)\" d=\"M8.3385 10.9925L2.31497 10.9925C2.20996 10.9925 2.114 10.9706 2.0271 10.9269C1.89953 10.8647 1.79671 10.7619 1.73451 10.6343C1.6908 10.5474 1.66895 10.4515 1.66895 10.3465C1.66895 10.2415 1.6908 10.1455 1.73451 10.0586C1.79671 9.93103 1.89953 9.82821 2.02709 9.766C2.114 9.72229 2.20996 9.70044 2.31497 9.70044L8.3385 9.70044L8.34272 9.70045C8.44608 9.70103 8.54064 9.72288 8.62637 9.766C8.75393 9.82821 8.85676 9.93103 8.91895 10.0586C8.96267 10.1455 8.98452 10.2415 8.98452 10.3465C8.98452 10.4515 8.96267 10.5474 8.91895 10.6343C8.85674 10.7619 8.75393 10.8647 8.62636 10.9269C8.53946 10.9706 8.44349 10.9925 8.3385 10.9925Z\" fill=\"rgb(0,0,0)\" fill-rule=\"evenodd\" />\n\t\t\t<path id=\"矢量 4752(边框)\" d=\"M11.6852 4.29962L5.66165 4.29962C5.55664 4.29962 5.46068 4.27776 5.37378 4.23405C5.24621 4.17185 5.14339 4.06903 5.08119 3.94147C5.03748 3.85456 5.01562 3.7586 5.01562 3.65359C5.01562 3.54858 5.03748 3.45262 5.08119 3.36572C5.14339 3.23816 5.24621 3.13534 5.37378 3.07313C5.46068 3.02942 5.55664 3.00757 5.66165 3.00757L11.6852 3.00757L11.6894 3.00758C11.7928 3.00816 11.8873 3.03001 11.9731 3.07313C12.1006 3.13533 12.2034 3.23816 12.2656 3.36572C12.3093 3.45263 12.3312 3.54858 12.3312 3.65359C12.3312 3.7586 12.3093 3.85456 12.2656 3.94146C12.2034 4.06903 12.1006 4.17185 11.973 4.23406C11.8861 4.27776 11.7902 4.29962 11.6852 4.29962Z\" fill=\"rgb(0,0,0)\" fill-rule=\"evenodd\" />\n\t\t\t<path id=\"椭圆 13(边框)\" d=\"M9.32747 12.806C9.64024 12.9355 9.97983 13.0003 10.3462 13.0003C10.7127 13.0003 11.0523 12.9355 11.365 12.806C11.6778 12.6764 11.9637 12.4821 12.2228 12.223C12.4819 11.9639 12.6762 11.678 12.8058 11.3652C12.9353 11.0524 13.0001 10.7129 13.0001 10.3464C13.0001 9.98001 12.9353 9.64042 12.8058 9.32766C12.6762 9.0149 12.4819 8.72897 12.2228 8.46987C11.9637 8.21076 11.6778 8.01644 11.365 7.88689C11.0523 7.75734 10.7127 7.69257 10.3463 7.69257C9.97983 7.69257 9.64024 7.75734 9.32747 7.88689C9.01471 8.01644 8.72878 8.21077 8.46968 8.46987C8.21058 8.72897 8.01626 9.0149 7.88671 9.32766C7.75716 9.64042 7.69238 9.98001 7.69238 10.3464C7.69238 10.7129 7.75716 11.0524 7.88671 11.3652C8.01626 11.678 8.21058 11.9639 8.46968 12.223C8.72878 12.4821 9.01471 12.6764 9.32747 12.806ZM11.3676 11.3678C11.1406 11.5948 10.8002 11.7083 10.3463 11.7083C9.89231 11.7083 9.55186 11.5948 9.32489 11.3678C9.09792 11.1408 8.98443 10.8004 8.98443 10.3464C8.98443 10.1584 9.01767 9.98415 9.08415 9.82365C9.15063 9.66316 9.25034 9.51644 9.3833 9.38348C9.51625 9.25053 9.66298 9.15081 9.82347 9.08433C9.98396 9.01785 10.1582 8.98461 10.3462 8.98461C10.8002 8.98461 11.1406 9.09809 11.3676 9.32507C11.5946 9.55204 11.7081 9.89249 11.7081 10.3464C11.7081 10.8004 11.5946 11.1408 11.3676 11.3678Z\" fill=\"rgb(0,0,0)\" fill-rule=\"evenodd\" />\n\t\t\t<path id=\"椭圆 14(边框)\" d=\"M2.63509 6.11311C2.94785 6.24265 3.28745 6.30743 3.65387 6.30743C4.02029 6.30743 4.35988 6.24266 4.67264 6.11311C4.9854 5.98356 5.27133 5.78923 5.53043 5.53013C5.78953 5.27103 5.98386 4.9851 6.11341 4.67234C6.24296 4.35958 6.30773 4.01999 6.30773 3.65356C6.30773 3.28714 6.24296 2.94755 6.11341 2.63478C5.98386 2.32202 5.78953 2.03609 5.53044 1.77699C5.27134 1.51789 4.9854 1.32357 4.67264 1.19402C4.35988 1.06447 4.02029 0.999695 3.65387 0.999695C3.28745 0.999695 2.94785 1.06447 2.63509 1.19402C2.32233 1.32357 2.0364 1.51789 1.7773 1.77699C1.5182 2.03609 1.32388 2.32202 1.19433 2.63479C1.06478 2.94755 1 3.28714 1 3.65356C1 4.01998 1.06477 4.35958 1.19432 4.67234C1.32387 4.9851 1.5182 5.27103 1.7773 5.53013C2.0364 5.78923 2.32233 5.98356 2.63509 6.11311ZM4.67523 4.67493C4.44826 4.9019 4.10781 5.01538 3.65387 5.01538C3.19993 5.01538 2.85947 4.9019 2.6325 4.67493C2.40553 4.44796 2.29205 4.1075 2.29205 3.65356C2.29205 3.19962 2.40553 2.85917 2.6325 2.6322C2.85947 2.40523 3.19993 2.29174 3.65387 2.29174C4.10781 2.29174 4.44826 2.40523 4.67523 2.6322C4.9022 2.85917 5.01569 3.19962 5.01569 3.65356C5.01569 4.1075 4.9022 4.44796 4.67523 4.67493Z\" fill=\"rgb(0,0,0)\" fill-rule=\"evenodd\" />\n\t\t</g>\n\t</g>\n</svg>",
  highlight: "<svg viewBox=\"0 0 14 14\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"14\" height=\"14\" fill=\"none\" customFrame=\"#000000\">\n\t<defs>\n\t\t<clipPath id=\"clipPath_10\">\n\t\t\t<rect width=\"14.000000\" height=\"14.000000\" x=\"0.000000\" y=\"0.000000\" fill=\"rgb(255,255,255)\" />\n\t\t</clipPath>\n\t</defs>\n\t<g id=\"Toolbar-highlight\">\n\t\t<g id=\"highlighter 1\" clip-path=\"url(#clipPath_10)\" customFrame=\"url(#clipPath_10)\">\n\t\t\t<rect id=\"highlighter 1\" width=\"14.000000\" height=\"14.000000\" x=\"0.000000\" y=\"0.000000\" />\n\t\t\t<path id=\"矢量 5165\" d=\"M5.25 6.41667L1.75 9.91667L1.75 11.6667L7 11.6667L8.75 9.91667\" fill-rule=\"nonzero\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.166667\" />\n\t\t\t<path id=\"矢量 5166\" d=\"M12.8334 6.99999L10.1501 9.68333C10.0057 9.82484 9.82704 9.9264 9.6316 9.97808C9.43616 10.0297 9.23065 10.0297 9.03521 9.97808C8.83976 9.9264 8.6611 9.82484 8.51674 9.68333L5.4834 6.65C5.34189 6.50563 5.24033 6.32697 5.18865 6.13153C5.13698 5.93608 5.13698 5.73057 5.18866 5.53513C5.24033 5.33969 5.34189 5.16103 5.4834 5.01666L8.16674 2.33333\" fill-rule=\"nonzero\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.166667\" />\n\t\t</g>\n\t</g>\n</svg>",
  task: "<svg viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"14\" height=\"14\" fill=\"none\">\n\t<rect id=\"square-check-big (1) 1\" width=\"24.000000\" height=\"24.000000\" x=\"0.000000\" y=\"0.000000\" />\n\t<path id=\"矢量 5848\" d=\"M21 10.656L21 19C21 19.3511 20.9076 19.696 20.732 20C20.5565 20.304 20.304 20.5565 20 20.7321C19.696 20.9076 19.3511 21 19 21L5 21C4.64893 21 4.30404 20.9076 4 20.732C3.69596 20.5565 3.44349 20.304 3.26795 20C3.09241 19.696 3 19.3511 3 19L3 5C3 4.64893 3.09241 4.30404 3.26795 4C3.44349 3.69596 3.69596 3.44349 4 3.26795C4.30404 3.09241 4.64893 3 5 3L17.344 3\" fill-rule=\"nonzero\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<path id=\"矢量 5849\" d=\"M9 11L12 14L22 4\" fill-rule=\"nonzero\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n</svg>",
  table: "<svg viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"14\" height=\"14\" fill=\"none\">\n\t<rect id=\"grid-2x2 1\" width=\"24.000000\" height=\"24.000000\" x=\"0.000000\" y=\"0.000000\" />\n\t<path id=\"矢量 5867\" d=\"M12 3L12 21\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<path id=\"矢量 5868\" d=\"M3 12L21 12\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<rect id=\"矩形 115\" width=\"18.000000\" height=\"18.000000\" x=\"3.000000\" y=\"3.000000\" rx=\"2.000000\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n</svg>",
  file: "<svg viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"14\" height=\"14\" fill=\"none\">\n\t<rect id=\"paperclip 2\" width=\"24.000000\" height=\"24.000000\" x=\"0.000000\" y=\"0.000000\" />\n\t<path id=\"矢量 5670\" d=\"M16 6.00005L7.58602 14.586C7.28731 14.8848 7.09083 15.2704 7.02475 15.6876C6.95866 16.1049 7.02636 16.5323 7.21815 16.9087C7.40993 17.2851 7.71596 17.5911 8.09236 17.7829C8.46876 17.9747 8.89621 18.0424 9.31346 17.9763C9.7307 17.9102 10.1163 17.7138 10.415 17.4151L18.829 8.82905C19.3257 8.33259 19.683 7.71411 19.8648 7.03579C20.0467 6.35747 20.0468 5.64323 19.8651 4.96487C19.6834 4.28651 19.3263 3.66794 18.8297 3.17136C18.3331 2.67478 17.7146 2.31768 17.0362 2.13597C16.3578 1.95426 15.6436 1.95435 14.9653 2.13622C14.287 2.3181 13.6685 2.67534 13.172 3.17205L4.79302 11.723C4.03831 12.4656 3.49351 13.3946 3.21394 14.4157C2.93437 15.4369 2.92998 16.5139 3.20123 17.5373C3.47247 18.5607 4.00969 19.4941 4.75834 20.2427C5.50698 20.9914 6.44039 21.5286 7.4638 21.7998C8.48721 22.0711 9.56417 22.0667 10.5853 21.7871C11.6065 21.5076 12.5355 20.9628 13.278 20.208L21.657 11.657\" fill-rule=\"nonzero\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n</svg>",
  bold: "<svg viewBox=\"0 0 14 14\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"14\" height=\"14\" fill=\"none\" customFrame=\"#000000\">\n\t<defs>\n\t\t<clipPath id=\"clipPath_20\">\n\t\t\t<rect width=\"14.000000\" height=\"14.000000\" x=\"0.000000\" y=\"0.000000\" fill=\"rgb(255,255,255)\" />\n\t\t</clipPath>\n\t</defs>\n\t<g id=\"Bold\">\n\t\t<g id=\"bold 1\" clip-path=\"url(#clipPath_20)\" customFrame=\"url(#clipPath_20)\">\n\t\t\t<rect id=\"bold 1\" width=\"14.000000\" height=\"14.000000\" x=\"0.000000\" y=\"0.000000\" />\n\t\t\t<path id=\"矢量 5173\" d=\"M3.5 7.00001L8.75 7.00001C9.24275 7.00001 9.72285 7.156 10.1215 7.44564C10.5201 7.73527 10.8169 8.14367 10.9691 8.6123C11.1214 9.08094 11.1214 9.58575 10.9691 10.0544C10.8169 10.523 10.5201 10.9314 10.1215 11.2211C9.72285 11.5107 9.24275 11.6667 8.75 11.6667L4.08333 11.6667C3.98094 11.6667 3.88034 11.6397 3.79167 11.5885C3.70299 11.5373 3.62935 11.4637 3.57815 11.375C3.52695 11.2863 3.5 11.1857 3.5 11.0833L3.5 2.91668C3.5 2.81428 3.52695 2.71369 3.57815 2.62501C3.62935 2.53633 3.70299 2.46269 3.79167 2.4115C3.88034 2.3603 3.98094 2.33334 4.08333 2.33334L8.16667 2.33334C8.65942 2.33334 9.13952 2.48934 9.53817 2.77897C9.93681 3.0686 10.2335 3.477 10.3858 3.94564C10.5381 4.41427 10.5381 4.91908 10.3858 5.38772C10.2335 5.85635 9.93681 6.26475 9.53817 6.55438C9.13952 6.84402 8.65942 7.00001 8.16667 7.00001\" fill-rule=\"nonzero\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.166667\" />\n\t\t</g>\n\t</g>\n</svg>",
  italic: "<svg viewBox=\"0 0 14 14\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"14\" height=\"14\" fill=\"none\" customFrame=\"#000000\">\n\t<defs>\n\t\t<clipPath id=\"clipPath_21\">\n\t\t\t<rect width=\"14.000000\" height=\"14.000000\" x=\"0.000000\" y=\"0.000000\" fill=\"rgb(255,255,255)\" />\n\t\t</clipPath>\n\t</defs>\n\t<g id=\"Italicize\">\n\t\t<g id=\"italic 1\" clip-path=\"url(#clipPath_21)\" customFrame=\"url(#clipPath_21)\">\n\t\t\t<rect id=\"italic 1\" width=\"14.000000\" height=\"14.000000\" x=\"0.000000\" y=\"0.000000\" />\n\t\t\t<line id=\"直线 265\" x1=\"0\" x2=\"5.25\" y1=\"0\" y2=\"0\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.166667\" transform=\"matrix(-1,0,0,-1,11.0835,2.33331)\" />\n\t\t\t<line id=\"直线 266\" x1=\"0\" x2=\"5.25\" y1=\"0\" y2=\"0\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.166667\" transform=\"matrix(-1,0,0,-1,8.1665,11.6667)\" />\n\t\t\t<line id=\"直线 267\" x1=\"0\" x2=\"9.96800327\" y1=\"0\" y2=\"0\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.166667\" transform=\"matrix(-0.351123,0.936329,-0.936329,-0.351123,8.75,2.33331)\" />\n\t\t</g>\n\t</g>\n</svg>",
  underline: "<svg viewBox=\"0 0 14 14\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"14\" height=\"14\" fill=\"none\" customFrame=\"#000000\">\n\t<defs>\n\t\t<clipPath id=\"clipPath_23\">\n\t\t\t<rect width=\"14.000000\" height=\"14.000000\" x=\"0.000000\" y=\"0.000000\" fill=\"rgb(255,255,255)\" />\n\t\t</clipPath>\n\t</defs>\n\t<g id=\"Underline\">\n\t\t<g id=\"underline 1\" clip-path=\"url(#clipPath_23)\" customFrame=\"url(#clipPath_23)\">\n\t\t\t<rect id=\"underline 1\" width=\"14.000000\" height=\"14.000000\" x=\"0.000000\" y=\"0.000000\" />\n\t\t\t<path id=\"矢量 5167\" d=\"M3.5 2.33331L3.5 5.83331C3.5 6.57244 3.73399 7.29259 4.16844 7.89056C4.60289 8.48853 5.21549 8.93361 5.91844 9.16201C6.62139 9.39041 7.37861 9.39041 8.08156 9.16201C8.78451 8.93361 9.39711 8.48853 9.83156 7.89056C10.266 7.29259 10.5 6.57244 10.5 5.83331L10.5 2.33331\" fill-rule=\"nonzero\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.166667\" />\n\t\t\t<line id=\"直线 264\" x1=\"2.33349609\" x2=\"11.6668291\" y1=\"11.666687\" y2=\"11.666687\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.166667\" />\n\t\t</g>\n\t</g>\n</svg>",
  strike: "<svg viewBox=\"0 0 14 14\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"14\" height=\"14\" fill=\"none\" customFrame=\"#000000\">\n\t<defs>\n\t\t<clipPath id=\"clipPath_22\">\n\t\t\t<rect width=\"14.000000\" height=\"14.000000\" x=\"0.000000\" y=\"0.000000\" fill=\"rgb(255,255,255)\" />\n\t\t</clipPath>\n\t</defs>\n\t<g id=\"Strikethrough\">\n\t\t<g id=\"strikethrough 1\" clip-path=\"url(#clipPath_22)\" customFrame=\"url(#clipPath_22)\">\n\t\t\t<rect id=\"strikethrough 1\" width=\"14.000000\" height=\"14.000000\" x=\"0.000000\" y=\"0.000000\" />\n\t\t\t<path id=\"矢量 5121\" d=\"M9.33327 2.33331L5.24994 2.33331C4.9699 2.33317 4.69391 2.40023 4.44516 2.52887C4.19641 2.65751 3.98216 2.84396 3.82042 3.07258C3.65868 3.30119 3.55416 3.56528 3.51565 3.84266C3.47714 4.12004 3.50576 4.40262 3.59911 4.66665\" fill-rule=\"nonzero\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.166667\" />\n\t\t\t<path id=\"矢量 5122\" d=\"M8.16667 7C8.65942 7 9.13952 7.15599 9.53817 7.44563C9.93681 7.73526 10.2335 8.14366 10.3858 8.61229C10.5381 9.08093 10.5381 9.58574 10.3858 10.0544C10.2335 10.523 9.93681 10.9314 9.53817 11.221C9.13952 11.5107 8.65942 11.6667 8.16667 11.6667L3.5 11.6667\" fill-rule=\"nonzero\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.166667\" />\n\t\t\t<line id=\"直线 263\" x1=\"2.33349609\" x2=\"11.6668291\" y1=\"7\" y2=\"7\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.166667\" />\n\t\t</g>\n\t</g>\n</svg>",
  h1: "<svg viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"14\" height=\"14\" fill=\"none\">\n\t<rect id=\"heading-1 3\" width=\"24.000000\" height=\"24.000000\" x=\"0.000000\" y=\"0.000000\" />\n\t<path id=\"矢量 5883\" d=\"M4 12L12 12\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<path id=\"矢量 5884\" d=\"M4 18L4 6\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<path id=\"矢量 5885\" d=\"M12 18L12 6\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<path id=\"矢量 5886\" d=\"M17 12L20 10L20 18\" fill-rule=\"nonzero\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n</svg>",
  h2: "<svg viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"14\" height=\"14\" fill=\"none\">\n\t<rect id=\"heading-2 3\" width=\"24.000000\" height=\"24.000000\" x=\"0.000000\" y=\"0.000000\" />\n\t<path id=\"矢量 5715\" d=\"M4 12L12 12\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<path id=\"矢量 5716\" d=\"M4 18L4 6\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<path id=\"矢量 5717\" d=\"M12 18L12 6\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<path id=\"矢量 5718\" d=\"M21 17.9999L17 17.9999C17 13.9999 21 14.9999 21 11.9999C21 10.4999 19 9.49994 17 10.9999\" fill-rule=\"nonzero\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n</svg>",
  h3: "<svg viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"14\" height=\"14\" fill=\"none\">\n\t<rect id=\"heading-3 3\" width=\"24.000000\" height=\"24.000000\" x=\"0.000000\" y=\"0.000000\" />\n\t<path id=\"矢量 5696\" d=\"M4 12L12 12\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<path id=\"矢量 5697\" d=\"M4 18L4 6\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<path id=\"矢量 5698\" d=\"M12 18L12 6\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<path id=\"矢量 5699\" d=\"M17.5 10.4999C19.2 9.49994 21 10.4999 21 11.9999C21 12.351 20.9076 12.6959 20.732 12.9999C20.5565 13.304 20.304 13.5565 20 13.732C19.696 13.9075 19.3511 13.9999 19 13.9999\" fill-rule=\"nonzero\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<path id=\"矢量 5700\" d=\"M17 17.5C19 19 21 17.8 21 16C21 15.6489 20.9076 15.304 20.732 15C20.5565 14.696 20.304 14.4435 20 14.2679C19.696 14.0924 19.3511 14 19 14\" fill-rule=\"nonzero\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n</svg>",
  h4: "<svg viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"14\" height=\"14\" fill=\"none\">\n\t<rect id=\"heading-4 2\" width=\"24.000000\" height=\"24.000000\" x=\"0.000000\" y=\"0.000000\" />\n\t<path id=\"矢量 5706\" d=\"M12 18L12 6\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<path id=\"矢量 5707\" d=\"M17 10L17 13C17 13.1755 17.0462 13.348 17.134 13.5C17.2217 13.652 17.348 13.7783 17.5 13.866C17.652 13.9538 17.8245 14 18 14L21 14\" fill-rule=\"nonzero\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<path id=\"矢量 5708\" d=\"M21 10L21 18\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<path id=\"矢量 5709\" d=\"M4 12L12 12\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<path id=\"矢量 5710\" d=\"M4 18L4 6\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n</svg>",
  h5: "<svg viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"14\" height=\"14\" fill=\"none\">\n\t<rect id=\"heading-5 2\" width=\"24.000000\" height=\"24.000000\" x=\"0.000000\" y=\"0.000000\" />\n\t<path id=\"矢量 5701\" d=\"M4 12L12 12\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<path id=\"矢量 5702\" d=\"M4 18L4 6\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<path id=\"矢量 5703\" d=\"M12 18L12 6\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<path id=\"矢量 5704\" d=\"M17 13L17 10L21 10\" fill-rule=\"nonzero\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<path id=\"矢量 5705\" d=\"M17 17.7C17.4 17.9 17.8 18 18.3 18C19.8 18 21 16.9 21 15.5C21 14.1 19.8 13 18.3 13L17 13\" fill-rule=\"nonzero\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n</svg>",
  h6: "<svg viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"14\" height=\"14\" fill=\"none\">\n\t<rect id=\"heading-6 2\" width=\"24.000000\" height=\"24.000000\" x=\"0.000000\" y=\"0.000000\" />\n\t<path id=\"矢量 5711\" d=\"M4 12L12 12\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<path id=\"矢量 5712\" d=\"M4 18L4 6\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<path id=\"矢量 5713\" d=\"M12 18L12 6\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<circle id=\"椭圆 62\" cx=\"19\" cy=\"16\" r=\"2\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<path id=\"矢量 5714\" d=\"M20 10C18 12 17 13.5 17 16\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n</svg>",
  sup: "<svg viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"14\" height=\"14\" fill=\"none\">\n\t<rect id=\"superscript 1\" width=\"24.000000\" height=\"24.000000\" x=\"0.000000\" y=\"0.000000\" />\n\t<path id=\"矢量 5851\" d=\"M4 19L12 11\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<path id=\"矢量 5852\" d=\"M12 19L4 11\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<path id=\"矢量 5853\" d=\"M20 12L16 12C16 10.5 16.442 10 17.5 9.50002C18.558 9.00002 20 8.33402 20 7.00202C20 6.53002 19.83 6.07202 19.516 5.71202C19.3039 5.47204 19.0397 5.28365 18.7438 5.16117C18.4478 5.0387 18.1278 4.98539 17.8081 5.00529C17.4884 5.02519 17.1775 5.11779 16.899 5.27602C16.479 5.51502 16.161 5.89002 16 6.33602\" fill-rule=\"nonzero\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n</svg>",
  sub: "<svg viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"14\" height=\"14\" fill=\"none\">\n\t<rect id=\"subscript 1\" width=\"24.000000\" height=\"24.000000\" x=\"0.000000\" y=\"0.000000\" />\n\t<path id=\"矢量 5854\" d=\"M4 5L12 13\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<path id=\"矢量 5855\" d=\"M12 5L4 13\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<path id=\"矢量 5856\" d=\"M20 19L16 19C16 17.5 16.44 17 17.5 16.5C18.56 16 20 15.33 20 14C20 13.53 19.83 13.07 19.52 12.71C19.3077 12.4696 19.0435 12.2808 18.7473 12.1579C18.4511 12.0349 18.1308 11.9812 17.8107 12.0006C17.4906 12.02 17.1791 12.1121 16.9 12.27C16.48 12.51 16.16 12.89 16 13.34\" fill-rule=\"nonzero\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n</svg>",
  ol: "<svg viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"14\" height=\"14\" fill=\"none\">\n\t<rect id=\"list-ordered (1) 1\" width=\"24.000000\" height=\"24.000000\" x=\"0.000000\" y=\"0.000000\" />\n\t<path id=\"矢量 5857\" d=\"M11 5L21 5\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<path id=\"矢量 5858\" d=\"M11 12L21 12\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<path id=\"矢量 5859\" d=\"M11 19L21 19\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<path id=\"矢量 5860\" d=\"M4 4L5 4L5 9\" fill-rule=\"nonzero\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<path id=\"矢量 5861\" d=\"M4 9L6 9\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<path id=\"矢量 5862\" d=\"M6.4999 20L3.3999 20C3.3999 19 5.9999 18.075 5.9999 16.5C5.99994 16.1984 5.90911 15.9039 5.73926 15.6548C5.5694 15.4056 5.32841 15.2135 5.04772 15.1034C4.76702 14.9932 4.45966 14.9703 4.16571 15.0375C3.87177 15.1046 3.6049 15.2588 3.3999 15.48\" fill-rule=\"nonzero\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n</svg>",
  ul: "<svg viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"14\" height=\"14\" fill=\"none\">\n\t<rect id=\"list (1) 1\" width=\"24.000000\" height=\"24.000000\" x=\"0.000000\" y=\"0.000000\" />\n\t<path id=\"矢量 5890\" d=\"M3 5L3.01 5\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<path id=\"矢量 5891\" d=\"M3 12L3.01 12\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<path id=\"矢量 5892\" d=\"M3 19L3.01 19\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<path id=\"矢量 5893\" d=\"M8 5L21 5\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<path id=\"矢量 5894\" d=\"M8 12L21 12\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n\t<path id=\"矢量 5895\" d=\"M8 19L21 19\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n</svg>",
  math: "<svg viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"14\" height=\"14\" fill=\"none\">\n\t<rect id=\"sigma 1\" width=\"24.000000\" height=\"24.000000\" x=\"0.000000\" y=\"0.000000\" />\n\t<path id=\"矢量 5847\" d=\"M18 7L18 5C18 4.82446 17.9538 4.65202 17.866 4.5C17.7783 4.34798 17.652 4.22174 17.5 4.13397C17.348 4.04621 17.1755 4 17 4L6.5 4C6.40714 4 6.31612 4.02586 6.23713 4.07467C6.15815 4.12349 6.09431 4.19334 6.05279 4.27639C6.01126 4.35945 5.99368 4.45242 6.00202 4.5449C6.01036 4.63738 6.04429 4.72572 6.1 4.8L10.6 10.8C10.7723 11.0297 10.8931 11.2938 10.9542 11.5743C11.0153 11.8548 11.0153 12.1452 10.9542 12.4257C10.8931 12.7062 10.7723 12.9703 10.6 13.2L6.1 19.2C6.04429 19.2743 6.01036 19.3626 6.00202 19.4551C5.99368 19.5476 6.01126 19.6406 6.05279 19.7236C6.09431 19.8067 6.15815 19.8765 6.23713 19.9253C6.31612 19.9741 6.40714 20 6.5 20L17 20C17.1755 20 17.348 19.9538 17.5 19.866C17.652 19.7783 17.7783 19.652 17.866 19.5C17.9538 19.348 18 19.1755 18 19L18 17\" fill-rule=\"nonzero\" stroke=\"rgb(0,0,0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.000000\" />\n</svg>",
};

export const TOOLBAR_BUTTONS: Record<string, ToolbarButtonDef> = {
  texttool: { id: "texttool", group: "texttool", icon: ICN.texttool, label: "文本工具", kind: "submenu" },
  ai:       { id: "ai",       group: "ai", icon: ICN.ai, label: "AI 助手", kind: "action", action: "ai" },
  translate:{ id: "translate",group: "ai", icon: ICN.translate, label: "翻译", kind: "action", action: "translate" },
  ref:      { id: "ref",      group: "ai", icon: ICN.ref, label: "引用", kind: "action", action: "ref" },
  copy:     { id: "copy",     group: "ai", icon: ICN.copy, label: "复制", kind: "action", action: "copy" },
  settings: { id: "settings", group: "ai", icon: ICN.settings, label: "设置", kind: "action", action: "settings" },
  highlight:{ id: "highlight",group: "main", icon: ICN.highlight, label: "高亮", kind: "format", op: "highlight" },
  task:     { id: "task",     group: "main", icon: ICN.task, label: "打钩清单", kind: "format", op: "task" },
  table:    { id: "table",    group: "main", icon: ICN.table, label: "插入表格", kind: "format", op: "table" },
  file:     { id: "file",     group: "main", icon: ICN.file, label: "插入文件", kind: "format", op: "file" },
  bold:     { id: "bold",     group: "sub", icon: ICN.bold, label: "粗体", kind: "format", op: "bold" },
  italic:   { id: "italic",   group: "sub", icon: ICN.italic, label: "斜体", kind: "format", op: "italic" },
  underline:{ id: "underline",group: "sub", icon: ICN.underline, label: "下划线", kind: "format", op: "underline" },
  strike:   { id: "strike",   group: "sub", icon: ICN.strike, label: "删除线", kind: "format", op: "strike" },
  h1:       { id: "h1",       group: "sub", icon: ICN.h1, label: "标题1", kind: "format", op: "h1" },
  h2:       { id: "h2",       group: "sub", icon: ICN.h2, label: "标题2", kind: "format", op: "h2" },
  h3:       { id: "h3",       group: "sub", icon: ICN.h3, label: "标题3", kind: "format", op: "h3" },
  h4:       { id: "h4",       group: "sub", icon: ICN.h4, label: "标题4", kind: "format", op: "h4" },
  h5:       { id: "h5",       group: "sub", icon: ICN.h5, label: "标题5", kind: "format", op: "h5" },
  h6:       { id: "h6",       group: "sub", icon: ICN.h6, label: "标题6", kind: "format", op: "h6" },
  sup:      { id: "sup",      group: "sub", icon: ICN.sup, label: "上角标", kind: "format", op: "sup" },
  sub:      { id: "sub",      group: "sub", icon: ICN.sub, label: "下角标", kind: "format", op: "sub" },
  ol:       { id: "ol",       group: "sub", icon: ICN.ol, label: "数字清单", kind: "format", op: "ol" },
  ul:       { id: "ul",       group: "sub", icon: ICN.ul, label: "普通清单", kind: "format", op: "ul" },
  math:     { id: "math",     group: "sub", icon: ICN.math, label: "数学公式", kind: "format", op: "math" },
};

/** 主栏可编辑按钮（除 texttool 固定入口外），用于勾选时的默认插入顺序 */
export const TOOLBAR_MAIN_EDITABLE: string[] = [
  "ai", "translate", "highlight", "ref", "copy", "settings", "task", "table", "file",
];
/** 子菜单全部候选（15 项），用于勾选时的默认插入顺序 */
export const TOOLBAR_SUB_ALL: string[] = [
  "bold", "italic", "underline", "strike",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "sup", "sub", "ol", "ul", "math",
];

function isArr(x: any): x is string[] {
  return Array.isArray(x);
}

export function normalizeToolbarMain(settings: LLMChatSettings): string[] {
  const pin = (out: string[]): string[] => {
    if (!out.includes("texttool")) {
      const at = out.indexOf("ai");
      if (at >= 0) out.splice(at + 1, 0, "texttool");
      else out.unshift("texttool");
    }
    if (!out.includes("ai")) out.unshift("ai");
    if (out[0] !== "ai") {
      const i = out.indexOf("ai");
      if (i > 0) { out.splice(i, 1); out.unshift("ai"); }
    }
    return out;
  };
  const v = (settings as any).selectionToolbarMainOrder;
  if (isArr(v) && v.length) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of v) {
      if (typeof id !== "string") continue;
      if (!TOOLBAR_BUTTONS[id]) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return pin(out);
  }
  const old = (settings as any).selectionToolbarOrder;
  if (isArr(old) && old.length) {
    const main = old.filter(
      (id: string) =>
        id === "texttool" ||
        ((TOOLBAR_BUTTONS[id]?.group === "ai" || TOOLBAR_BUTTONS[id]?.group === "main"))
    );
    return pin(main.length ? main : [...DEFAULT_TOOLBAR_MAIN_ORDER]);
  }
  return pin([...DEFAULT_TOOLBAR_MAIN_ORDER]);
}

export function normalizeToolbarSubmenu(settings: LLMChatSettings): string[] {
  const v = (settings as any).selectionToolbarSubmenuIds;
  if (isArr(v)) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of v) {
      if (typeof id !== "string") continue;
      if (TOOLBAR_BUTTONS[id]?.group !== "sub") continue;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }
  // 迁移：旧 selectionToolbarOrder 中的 sub 类
  const old = (settings as any).selectionToolbarOrder;
  if (isArr(old) && old.length) {
    return old.filter((id: string) => TOOLBAR_BUTTONS[id]?.group === "sub");
  }
  return [...DEFAULT_TOOLBAR_SUBMENU_IDS];
}

// 按默认顺序把 id 插入数组（保持默认次序合理）
function insertByDefaultOrder(arr: string[], id: string, defaultOrder: string[]): void {
  if (arr.includes(id)) return;
  const pos = defaultOrder.indexOf(id);
  let insertAt = arr.length;
  for (let i = 0; i < arr.length; i++) {
    if (defaultOrder.indexOf(arr[i]) > pos) {
      insertAt = i;
      break;
    }
  }
  arr.splice(insertAt, 0, id);
}

function wireDrag(row: HTMLElement, listEl: HTMLElement, arr: string[], after: () => void, draggable = true): void {
  if (!draggable) return;
  row.setAttribute("draggable", "true");
  row.addEventListener("dragstart", () => {
    row.classList.add("dragging");
  });
  row.addEventListener("dragend", () => {
    row.classList.remove("dragging");
  });
  row.addEventListener("dragover", (e) => {
    e.preventDefault();
    const dragging = listEl.querySelector(".dragging") as HTMLElement | null;
    if (!dragging || dragging === row) return;
    const rect = row.getBoundingClientRect();
    const next = (e.clientY - rect.top) / rect.height > 0.5;
    if (next) listEl.insertBefore(dragging, row.nextSibling);
    else listEl.insertBefore(dragging, row);
  });
  row.addEventListener("drop", (e) => {
    e.preventDefault();
    const ids: string[] = [];
    listEl.querySelectorAll<HTMLElement>(".llm-tb-row-member").forEach((r) => {
      if (r.dataset.id) ids.push(r.dataset.id);
    });
    arr.length = 0;
    arr.push(...ids);
    after();
  });
}

export interface ToolbarEditorOpts {
  container: HTMLElement;
  settings: LLMChatSettings;
  save: () => void;
}

export function renderSelectionToolbarEditor(opts: ToolbarEditorOpts): void {
  const { container, settings, save } = opts;
  // 注意：不要 container.empty()！调用方（SettingsTab.renderGeneralTab / SettingsRenderer）传入的 container
  // 已经包含「界面语言」「系统提示词」等设置项，empty() 会把它们全部销毁。
  // 这里改为追加渲染，工具栏编辑器跟在已有设置项后面。

  const main: string[] = normalizeToolbarMain(settings);
  const subIds: string[] = normalizeToolbarSubmenu(settings);

  const write = () => {
    settings.selectionToolbarMainOrder = main.slice();
    settings.selectionToolbarSubmenuIds = subIds.slice();
    save();
  };

  // ---------- 预览（顶部）：真实工具栏外观 + 子菜单展开，实时反映勾选与排序 ----------
  container.createEl("div", { cls: "llm-tb-section-title", text: "预览（实时反映下方勾选与排序）" });
  const preview = container.createDiv({ cls: "llm-tb-preview" });
  const previewBar = preview.createDiv({ cls: "llm-chat-selection-toolbar llm-tb-pv-bar" });
  previewBar.style.position = "relative";

  // 恢复默认（位于预览中、主工具栏右侧）
  const resetBtn = preview.createEl("button", { cls: "llm-tb-reset", text: "恢复默认" });
  resetBtn.addEventListener("click", () => {
    main.length = 0;
    main.push(...DEFAULT_TOOLBAR_MAIN_ORDER);
    subIds.length = 0;
    subIds.push(...DEFAULT_TOOLBAR_SUBMENU_IDS);
    write();
    renderMain();
    renderSub();
    renderPreview();
  });

  const renderPreview = () => {
    previewBar.empty();
    // 主工具栏（真实外观，按勾选顺序）
    normalizeToolbarMain(settings).forEach((id) => {
      const def = TOOLBAR_BUTTONS[id];
      if (!def) return;
      const b = previewBar.createDiv({ cls: "llm-st-icon-btn" });
      if (def.id === "ai") b.addClass("llm-st-ai-btn");
      else if (def.id === "highlight") b.addClass("llm-st-highlight-btn");
      else b.addClass("llm-st-fmt-btn");
      if (def.group === "texttool") b.dataset.selBtn = def.id;
      b.innerHTML = def.icon;
      b.setAttribute("title", def.label);
    });
    // 子菜单：作为工具栏子元素（T 形连续描边）默认展开，挂在文本工具按钮下方
    const subIds2 = normalizeToolbarSubmenu(settings);
    if (subIds2.length) {
      const previewSub = previewBar.createDiv({ cls: "llm-st-submenu llm-st-submenu-down" });
      subIds2.forEach((id) => {
        const def = TOOLBAR_BUTTONS[id];
        if (!def) return;
        const b = previewSub.createDiv({ cls: "llm-st-submenu-item" });
        b.innerHTML = def.icon;
        b.setAttribute("title", def.label);
      });
      const tt = previewBar.querySelector('[data-sel-btn="texttool"]') as HTMLElement | null;
      if (tt) previewSub.style.left = tt.offsetLeft + "px";
      preview.style.paddingBottom = previewSub.offsetHeight + 12 + "px";
    } else {
      preview.style.paddingBottom = "";
    }
  };

  // ---------- 左右两栏 ----------
  const cols = container.createDiv({ cls: "llm-tb-cols" });
  const left = cols.createDiv({ cls: "llm-tb-col" });
  const right = cols.createDiv({ cls: "llm-tb-col" });

  // 左：主工具栏
  left.createEl("div", { cls: "llm-tb-col-title", text: "主工具栏" });
  const mainList = left.createDiv({ cls: "llm-tb-list" });
  const MAIN_CANDIDATES = ["texttool", ...TOOLBAR_MAIN_EDITABLE];

  const renderMain = () => {
    mainList.empty();
    const checkedSet = new Set(main);
    const ordered = [...main, ...MAIN_CANDIDATES.filter((id) => !checkedSet.has(id))];
    ordered.forEach((id) => {
      const def = TOOLBAR_BUTTONS[id];
      if (!def) return;
      const checked = checkedSet.has(id);
      // ai 永远第一位、文本工具为子菜单固定入口，二者均不可取消
      const locked = id === "ai" || id === "texttool";
      const row = mainList.createDiv({ cls: "llm-tb-row" + (checked ? " llm-tb-row-member" : " llm-tb-row-disabled") });
      row.dataset.id = id;
      row.createDiv({ cls: "llm-tb-handle", text: "⠿" });
      const ic = row.createDiv({ cls: "llm-tb-ic" });
      ic.innerHTML = def.icon;
      row.createDiv({ cls: "llm-tb-name", text: def.label });
      row.createDiv({ cls: "llm-tb-spacer" });
      const cbWrap = row.createDiv({ cls: "llm-tb-cb" });
      const cb = cbWrap.createEl("input", { type: "checkbox" });
      cb.checked = checked;
      if (locked) {
        cb.disabled = true;
        cb.setAttribute("title", id === "ai" ? "AI 助手固定为第一位" : "文本工具为子菜单入口，固定显示");
      }
      cb.addEventListener("change", () => {
        if (cb.checked) insertByDefaultOrder(main, id, TOOLBAR_MAIN_EDITABLE);
        else if (!locked) {
          const i = main.indexOf(id);
          if (i >= 0) main.splice(i, 1);
        }
        write();
        renderMain();
        renderPreview();
      });
      if (checked && !locked) {
        wireDrag(row, mainList, main, () => { write(); renderMain(); renderPreview(); });
      }
    });
  };

  // 右：文本工具子菜单
  right.createEl("div", { cls: "llm-tb-col-title", text: "文本工具 · 子菜单" });
  const subList = right.createDiv({ cls: "llm-tb-list" });

  const renderSub = () => {
    subList.empty();
    const subSet = new Set(subIds);
    subIds.forEach((id, idx) => {
      const def = TOOLBAR_BUTTONS[id];
      if (!def) return;
      const row = subList.createDiv({ cls: "llm-tb-row llm-tb-row-member" });
      row.dataset.id = id;
      row.createDiv({ cls: "llm-tb-handle", text: "⠿" });
      const ic = row.createDiv({ cls: "llm-tb-ic" });
      ic.innerHTML = def.icon;
      row.createDiv({ cls: "llm-tb-name", text: def.label });
      row.createDiv({ cls: "llm-tb-spacer" });
      const cbWrap = row.createDiv({ cls: "llm-tb-cb" });
      const cb = cbWrap.createEl("input", { type: "checkbox" });
      cb.checked = true;
      cb.addEventListener("change", () => {
        if (cb.checked) insertByDefaultOrder(subIds, id, TOOLBAR_SUB_ALL);
        else {
          const i = subIds.indexOf(id);
          if (i >= 0) subIds.splice(i, 1);
        }
        write();
        renderSub();
        renderPreview();
      });
      wireDrag(row, subList, subIds, () => { write(); renderSub(); renderPreview(); });
    });
    TOOLBAR_SUB_ALL.filter((id) => !subSet.has(id)).forEach((id) => {
      const def = TOOLBAR_BUTTONS[id];
      if (!def) return;
      const row = subList.createDiv({ cls: "llm-tb-row llm-tb-row-disabled" });
      row.dataset.id = id;
      row.createDiv({ cls: "llm-tb-handle", text: "⠿" });
      const ic = row.createDiv({ cls: "llm-tb-ic" });
      ic.innerHTML = def.icon;
      row.createDiv({ cls: "llm-tb-name", text: def.label });
      row.createDiv({ cls: "llm-tb-spacer" });
      const cbWrap = row.createDiv({ cls: "llm-tb-cb" });
      const cb = cbWrap.createEl("input", { type: "checkbox" });
      cb.checked = false;
      cb.addEventListener("change", () => {
        if (cb.checked) insertByDefaultOrder(subIds, id, TOOLBAR_SUB_ALL);
        else {
          const i = subIds.indexOf(id);
          if (i >= 0) subIds.splice(i, 1);
        }
        write();
        renderSub();
        renderPreview();
      });
    });
  };

  renderMain();
  renderSub();
  renderPreview();
}
