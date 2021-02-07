import React, { useEffect } from 'react';
import Button from '@material-ui/core/Button';
import ListItemText from '@material-ui/core/ListItemText';
import Grid from '@material-ui/core/Grid';
import { makeStyles } from '@material-ui/core/styles';

const useStyles = makeStyles((theme) => ({
	root: {
		flexGrow: 1,
		width: "100%",
		margin: 0,
		padding: 0
	},
	textbutton: {
		width: "100%",
		justifyContent: "flex-start",
		paddingLeft: 2,
		paddingTop: 4,
		paddingBottom: 4,
	}
}));

export default function Account(props) {

  // Similar to componentDidMount and componentDidUpdate:
  useEffect(() => {
  });

  const classes = useStyles();

  const stateData = props.stateData;

  let toggleStatusBarTextLabel = "Hide status bar metrics";
  if (!stateData.statusBarTextVisible) {
    toggleStatusBarTextLabel = "Show status bar metrics";
  }

  function configureSettingsClickHandler() {
    let command = {
      action: "codetime.configureSettings",
      command: "command_execute"
    };
    props.vscode.postMessage(command);
  }

  function documentationClickHandler() {
	let command = {
		action: "codetime.displayReadme",
		command: "command_execute"
	  };
	  props.vscode.postMessage(command);
  }

  function submitIssueClickHandler() {
	let command = {
		action: "codetime.submitAnIssue",
		command: "command_execute"
	  };
	  props.vscode.postMessage(command);
  }

  function toggleStatusVisibilityClickHandler() {
	let command = {
		action: "codetime.toggleStatusBar",
		command: "command_execute"
	  };
	  props.vscode.postMessage(command);
  }

  return (
	<Grid container className={classes.root}>
		<Grid item xs={12}>
			<ListItemText primary="Account" secondary="Manage your account" />
		</Grid>
		<Grid item xs={12}>
			<Button onClick={configureSettingsClickHandler} className={classes.textbutton}>Configure settings</Button>
		</Grid>
		<Grid item xs={12}>
			<Button onClick={documentationClickHandler} className={classes.textbutton}>Documentation</Button>
		</Grid>
		<Grid item xs={12}>
			<Button onClick={submitIssueClickHandler} className={classes.textbutton}>Submit an issue</Button>
		</Grid>
		<Grid item xs={12}>
			<Button onClick={toggleStatusVisibilityClickHandler} className={classes.textbutton}>{toggleStatusBarTextLabel}</Button>
		</Grid>
	</Grid>
  );
}