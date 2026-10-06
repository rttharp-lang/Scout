// Mascot Lab — shared UI primitives. Import from here:
//   import { Button, Slider, Modal, useToast } from "../components/index.js";
import "./components.css";

export { cx } from "./cx.js";
export { Button, Spinner } from "./Button.jsx";
export { IconButton } from "./IconButton.jsx";
export { Field, Input, Textarea } from "./Field.jsx";
export { Slider } from "./Slider.jsx";
export { Select } from "./Select.jsx";
export { Toggle } from "./Toggle.jsx";
export { Segmented } from "./Segmented.jsx";
export { Chip, ChipRow } from "./Chip.jsx";
export { ColorField, normHex } from "./ColorField.jsx";
export { NumberStepper } from "./NumberStepper.jsx";
export { Modal, Sheet, ConfirmProvider, useConfirm } from "./Modal.jsx";
export { ToastProvider, useToast } from "./Toast.jsx";
export { SpecLabel } from "./SpecLabel.jsx";
export { Swatch, inkFor } from "./Swatch.jsx";
export { Skeleton } from "./Skeleton.jsx";
export { CanvasImage } from "./CanvasImage.jsx";
export { Tabs, TabPanel, tabId, panelId } from "./Tabs.jsx";
export { Notice } from "./Notice.jsx";
export { CopyText, copyToClipboard } from "./CopyText.jsx";
export { Wordmark, RegMark } from "./Brand.jsx";
export { StepNav } from "./StepNav.jsx";
export { TeamChip } from "./TeamChip.jsx";
export { ThemeSwitch, applyTheme, savedTheme, THEME_KEY } from "./ThemeSwitch.jsx";
export { useRoute, navigate, currentRoute, href } from "./router.js";
