import React, { useState, useEffect } from "react";
import Button from "@material-ui/core/Button";
import List from "@material-ui/core/List";
import ListItemText from "@material-ui/core/ListItemText";
import ListItem from "@material-ui/core/ListItem";
import Grid from "@material-ui/core/Grid";
import { makeStyles } from "@material-ui/core/styles";
import Workspaces from "./workspaces";
import { VisibilityIcon, SettingsIcon, MessageIcon, DocumentIcon, PawIcon } from "../icons";
import { HIDE_CODE_TIME_STATUS_LABEL, SHOW_CODE_TIME_STATUS_LABEL } from "../../contants";

const useStyles = makeStyles((theme) => ({
  root: {
    flexGrow: 1,
    width: "100%",
    margin: 0,
    padding: 0,
  },
  textbutton: {
    width: "100%",
    justifyContent: "flex-start",
    padding: theme.spacing(0.25, 0.5),
    fontWeight: 500,
  },
  secondaryAction: {
    right: 0,
  },
}));

export default function Account(props) {
  // Similar to componentDidMount and componentDidUpdate:
  useEffect(() => {});
  const classes = useStyles();
  const stateData = props.stateData;

  const [state, setState] = useState({
    statusBarTextVisible: stateData.statusBarTextVisible,
  });

  let toggleStatusBarTextLabel = SHOW_CODE_TIME_STATUS_LABEL;
  if (state.statusBarTextVisible) {
    toggleStatusBarTextLabel = HIDE_CODE_TIME_STATUS_LABEL;
  }

  function configureSettingsClickHandler() {
    const command = {
      action: "codetime.configureSettings",
      command: "command_execute",
    };
    props.vscode.postMessage(command);
  }

  function documentationClickHandler() {
    const command = {
      action: "codetime.displayReadme",
      command: "command_execute",
    };
    props.vscode.postMessage(command);
  }

  function submitIssueClickHandler() {
    const command = {
      action: "codetime.submitAnIssue",
      command: "command_execute",
    };
    props.vscode.postMessage(command);
  }

  function switchAccountClickHandler() {
    const command = {
      action: "codetime.switchAccounts",
      command: "command_execute",
    };
    props.vscode.postMessage(command);
  }

  function toggleStatusVisibilityClickHandler() {
    const command = {
      action: "codetime.toggleStatusBar",
      command: "command_execute",
    };
    props.vscode.postMessage(command);
    // update the state
    setState({ statusBarTextVisible: !state.statusBarTextVisible });
  }

  return (
    <Grid container className={classes.root}>
      <Grid item xs={12}>
        <List style={{ padding: 0, margin: 0 }}>
          <ListItem style={{ padding: 0, margin: 0 }}>
            <ListItemText primary="Account" secondary={!stateData.registered ? "Manage your account" : stateData.email} />
          </ListItem>
        </List>
      </Grid>
      <Grid item xs={12}>
        <Button onClick={switchAccountClickHandler} classes={{ root: classes.textbutton }} startIcon={<PawIcon />}>
          Switch account
        </Button>
      </Grid>
      <Grid item xs={12}>
        <Button onClick={configureSettingsClickHandler} classes={{ root: classes.textbutton }} startIcon={<SettingsIcon />}>
          Configure settings
        </Button>
      </Grid>
      <Grid item xs={12}>
        <Button onClick={documentationClickHandler} classes={{ root: classes.textbutton }} startIcon={<DocumentIcon />}>
          Documentation
        </Button>
      </Grid>
      <Grid item xs={12}>
        <Button onClick={submitIssueClickHandler} classes={{ root: classes.textbutton }} startIcon={<MessageIcon />}>
          Submit an issue
        </Button>
      </Grid>
      <Grid item xs={12}>
        <Button onClick={toggleStatusVisibilityClickHandler} classes={{ root: classes.textbutton }} startIcon={<VisibilityIcon />}>
          {toggleStatusBarTextLabel}
        </Button>
      </Grid>
      <Grid item xs={12}>
        <Workspaces vscode={props.vscode} stateData={props.stateData} />
      </Grid>
    </Grid>
  );
}
