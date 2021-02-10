import React, { useState, useEffect } from "react";
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
import HelpIcon from "@material-ui/icons/Help";
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
}));

export default function FlowMode(props) {
  // Similar to componentDidMount and componentDidUpdate:
  useEffect(() => {});
  const classes = useStyles();
  const stateData = props.stateData;

  const [state, setState] = useState({
    inFlowMode: stateData.inFlowMode,
    flowModeScreenState: stateData.flowModeScreenState,
    slackCheckOpen: false,
  });

  useEffect(() => {
    function handleResize() {
      let exitFlowMode = false;
      if (
        (window.outerHeight === screen.height && window.outerWidth === screen.width) ||
        (window.screenLeft === 0 && window.outerWidth === screen.width)
      ) {
        // ful screen mode
        if (state.inFlowMode && state.flowModeScreenState !== 2) {
          exitFlowMode = true;
          // deactivate flow mode
          setState({ inFlowMode: false, flowModeScreenState: state.flowModeScreenState, slackCheckOpen: false });
        }
      } else {
        // normal screen mode
        if (state.inFlowMode && state.flowModeScreenState !== 0) {
          exitFlowMode = true;
          // deactivate flow mode
          setState({ inFlowMode: false, flowModeScreenState: state.flowModeScreenState, slackCheckOpen: false });
        }
      }

      if (exitFlowMode) {
        const command = {
          action: "codetime.exitFlowMode",
          command: "command_execute",
        };
        props.vscode.postMessage(command);
      }
    }

    window.addEventListener("resize", handleResize);
  });

  function flowModeClickHandler() {
    if (!state.inFlowMode) {
      if (!stateData.registered) {
        // this will just show the sign up prompt
        toggleFlow(false /*updateState*/);
        return;
      } else if (!stateData.slackConnected) {
        // this will show the continue or continue anyway
        setState({ inFlowMode: state.inFlowMode, flowModeScreenState: stateData.flowModeScreenState, slackCheckOpen: true });
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
      setState({ inFlowMode: !state.inFlowMode, flowModeScreenState: stateData.flowModeScreenState, slackCheckOpen: false });
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
      setState({ inFlowMode: state.inFlowMode, flowModeScreenState: stateData.flowModeScreenState, slackCheckOpen: false });
    }
  };

  return (
    <Grid container className={classes.root}>
      <Grid item xs={12}>
        <List style={{ padding: 0, margin: 0 }}>
          <ListItem style={{ padding: 0, margin: 0 }}>
            <ListItemText primary="Flow Mode" secondary="Block out distractions" />
            <ListItemSecondaryAction>
              <IconButton edge="end" aria-label="delete">
                <HelpIcon />
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
