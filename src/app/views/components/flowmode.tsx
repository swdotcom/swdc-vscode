import React, { useState } from "react";
import { makeStyles } from "@material-ui/core/styles";
import Button from "@material-ui/core/Button";
import Grid from "@material-ui/core/Grid";
import ListItemText from "@material-ui/core/ListItemText";
import RadioButtonUncheckedIcon from "@material-ui/icons/RadioButtonUnchecked";
import FiberManualRecordIcon from "@material-ui/icons/FiberManualRecord";
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import IconButton from "@material-ui/core/IconButton";
import ListItemSecondaryAction from "@material-ui/core/ListItemSecondaryAction";
import blue from "@material-ui/core/colors/blue";
import SettingsIcon from "@material-ui/icons/Settings";
import FlowConfirm from "./flowconfirm";

const useStyles = makeStyles((theme) => ({
  root: {
    flexGrow: 1,
    width: "100%",
    margin: 0,
    padding: 0,
  },
  button: {
    marginTop: 6,
  },
  iconBtnRoot: {
    color: "rgba(222,222,222,0.75)",
  },
  secondaryAction: {
    right: 0,
  },
  typography: {
    padding: theme.spacing(2),
  },
}));

export default function FlowMode(props) {
  const classes = useStyles();
  const stateData = props.stateData;

  const [state, setState] = useState({
    inFlowMode: stateData.inFlowMode,
    slackCheckOpen: false,
  });

  function flowModeClickHandler() {
    if (!state.inFlowMode) {
      if (!stateData.registered) {
        // this will just show the sign up prompt
        toggleFlow(false /*updateState*/);
        return;
      } else if (!stateData.slackConnected) {
        // this will show the continue or continue anyway
        setState({ inFlowMode: state.inFlowMode, slackCheckOpen: true });
        return;
      }
    }

    toggleFlow();
  }

  const toggleFlow = (updateState: boolean = true) => {
    const command = {
      action: !state.inFlowMode ? "codetime.enableFlow" : "codetime.exitFlowMode",
      command: "command_execute",
      arguments: [{ skipSlackCheck: true }],
    };

    props.vscode.postMessage(command);

    if (updateState) {
      // update the state
      setState({ inFlowMode: !state.inFlowMode, slackCheckOpen: false });
    }
  };

  const handleSlackCheckClick = (value) => {
    let updateState = true;
    if (value === "continue") {
      updateState = false;
      toggleFlow();
    } else if (value === "connect") {
      const command = {
        action: "codetime.connectSlackWorkspace",
        command: "command_execute",
      };
      props.vscode.postMessage(command);
    }

    if (updateState) {
      setState({ inFlowMode: state.inFlowMode, slackCheckOpen: false });
    }
  };

  const configureSettingsClick = () => {
    const command = {
      action: "codetime.configureSettings",
      command: "command_execute",
    };
    props.vscode.postMessage(command);
  };

  return (
    <Grid container className={classes.root}>
      <Grid item xs={12}>
        <List style={{ padding: 0, margin: 0 }}>
          <ListItem style={{ padding: 0, margin: 0 }}>
            <ListItemText primary="Flow Mode" secondary="Block out distractions" />
            <ListItemSecondaryAction classes={{ root: classes.secondaryAction }}>
              <IconButton
                size="small"
                classes={{ root: classes.iconBtnRoot }}
                edge="end"
                aria-label="Flow Mode Info"
                onClick={configureSettingsClick}
              >
                <SettingsIcon style={{ color: blue[500] }} />
              </IconButton>
            </ListItemSecondaryAction>
          </ListItem>
        </List>
      </Grid>
      {!state.slackCheckOpen && (
        <Grid item xs={12}>
          <Button
            variant="contained"
            color="primary"
            onClick={flowModeClickHandler}
            className={classes.button}
            startIcon={!state.inFlowMode ? <RadioButtonUncheckedIcon fontSize="small" /> : <FiberManualRecordIcon fontSize="small" />}
          >
            {!state.inFlowMode ? "Enter Flow Mode" : "Exit Flow Mode"}
          </Button>
        </Grid>
      )}
      {state.slackCheckOpen && <FlowConfirm onClick={handleSlackCheckClick} />}
    </Grid>
  );
}
