import React, { useState, useEffect } from "react";
import Button from "@material-ui/core/Button";
import List from "@material-ui/core/List";
import ListItemText from "@material-ui/core/ListItemText";
import ListItem from "@material-ui/core/ListItem";
import ListItemSecondaryAction from "@material-ui/core/ListItemSecondaryAction";
import IconButton from "@material-ui/core/IconButton";
import Grid from "@material-ui/core/Grid";
import { makeStyles } from "@material-ui/core/styles";
import Workspaces from "./workspaces";
import { GoogleIcon, GithubIcon, EmailIcon } from "../icons";
import { VisibilityIcon, SettingsIcon, MessageIcon, DocumentIcon, PawIcon } from "../icons";

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

  let toggleStatusBarTextLabel = "Hide status bar metrics";
  if (state.statusBarTextVisible) {
    toggleStatusBarTextLabel = "Show status bar metrics";
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
            <ListItemSecondaryAction>
              <IconButton edge="end" aria-label="Authentication type" style={{ width: 32, height: 32 }}>
                {!stateData.registered ? null : stateData.authType === "github" ? (
                  <GithubIcon />
                ) : stateData.authType === "google" ? (
                  <GoogleIcon />
                ) : (
                  <EmailIcon />
                )}
              </IconButton>
            </ListItemSecondaryAction>
          </ListItem>
        </List>
      </Grid>
      <Grid item xs={12}>
        <Button onClick={switchAccountClickHandler} className={classes.textbutton} startIcon={<PawIcon />}>
          Switch account
        </Button>
      </Grid>
      <Grid item xs={12}>
        <Button onClick={configureSettingsClickHandler} className={classes.textbutton} startIcon={<SettingsIcon />}>
          Configure settings
        </Button>
      </Grid>
      <Grid item xs={12}>
        <Workspaces vscode={props.vscode} stateData={props.stateData} />
      </Grid>
      <Grid item xs={12}>
        <Button onClick={documentationClickHandler} className={classes.textbutton} startIcon={<DocumentIcon />}>
          Documentation
        </Button>
      </Grid>
      <Grid item xs={12}>
        <Button onClick={submitIssueClickHandler} className={classes.textbutton} startIcon={<MessageIcon />}>
          Submit an issue
        </Button>
      </Grid>
      <Grid item xs={12}>
        <Button onClick={toggleStatusVisibilityClickHandler} className={classes.textbutton} startIcon={<VisibilityIcon />}>
          {toggleStatusBarTextLabel}
        </Button>
      </Grid>
    </Grid>
  );
}
