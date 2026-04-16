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
