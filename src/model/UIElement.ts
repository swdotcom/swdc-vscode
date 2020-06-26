import { KpmItem } from "./models";

export default class UIElement {
	element_name: string = "";
	element_location: string = "";
	color: string = "";
	icon_name: string = "";
	cta_text: string = "";

	static transformKpmItemToUIElement(kpmItem: KpmItem): UIElement {
		const uiEl: UIElement = new UIElement();
		uiEl.color = kpmItem.color;
		uiEl.cta_text = kpmItem.description || kpmItem.tooltip;
		uiEl.element_location = kpmItem.location;
		uiEl.element_name = kpmItem.label;
		uiEl.icon_name = kpmItem.icon;
		return uiEl;
	}
}