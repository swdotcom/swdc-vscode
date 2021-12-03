import {HIDE_CODE_TIME_STATUS_LABEL, SHOW_CODE_TIME_STATUS_LABEL} from '../Constants';
import {isStatusBarTextVisible} from '../managers/StatusBarManager';
import {KpmItem, UIInteractionType} from '../model/models';

export function getHideStatusBarMetricsButton(): KpmItem {
  let toggleStatusBarTextLabel = SHOW_CODE_TIME_STATUS_LABEL;
  if (isStatusBarTextVisible()) {
    toggleStatusBarTextLabel = HIDE_CODE_TIME_STATUS_LABEL;
  }

  const item: KpmItem = getActionButton(
    toggleStatusBarTextLabel,
    'Toggle the Code Time status',
    'codetime.toggleStatusBar',
    'visible.svg'
  );
  item.location = 'ct_menu_tree';
  item.name = 'ct_toggle_status_bar_metrics_btn';
  item.color = 'blue';
  item.interactionIcon = 'slash-eye';
  return item;
}

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
