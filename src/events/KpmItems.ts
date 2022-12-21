import {KpmItem, UIInteractionType} from '../model/models';

export function configureSettingsKpmItem(): KpmItem {
  const item: KpmItem = new KpmItem();
  item.name = 'ct_configure_settings_btn';
  item.description = 'End of day notification - configure settings';
  item.location = 'ct_notification';
  item.label = 'Settings';
  item.interactionType = UIInteractionType.Click;
  item.interactionIcon = null;
  item.color = null;
  return item;
}

export function showMeTheDataKpmItem(): KpmItem {
  const item: KpmItem = new KpmItem();
  item.name = 'ct_show_me_the_data_btn';
  item.description = 'End of day notification - Show me the data';
  item.location = 'ct_notification';
  item.label = 'Show me the data';
  item.interactionType = UIInteractionType.Click;
  item.interactionIcon = null;
  item.color = null;
  return item;
}

export function getActionButton(
  label: string,
  tooltip: string,
  command: string,
  icon: any | null = null,
  eventDescription: string = '',
  color: any | null = null,
  description: string | null = ''
): KpmItem {
  const item: KpmItem = new KpmItem();
  item.tooltip = tooltip ?? '';
  item.label = label;
  item.id = label;
  item.command = command;
  item.icon = icon;
  item.contextValue = 'action_button';
  item.eventDescription = eventDescription;
  item.color = color;
  item.description = description;
  return item;
}
