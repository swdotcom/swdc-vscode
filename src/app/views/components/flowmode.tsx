import React, { useState, useEffect } from "react";
import { makeStyles } from "@material-ui/core/styles";
import Button from "@material-ui/core/Button";
import Grid from "@material-ui/core/Grid";
import ListItemText from "@material-ui/core/ListItemText";

const useStyles = makeStyles((theme) => ({
  root: {
    flexGrow: 1,
    width: "100%",
    margin: 0,
    padding: 0,
  },
  button: {
    marginTop: 10,
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
          setState({ inFlowMode: false, flowModeScreenState: state.flowModeScreenState });
        }
      } else {
        // normal screen mode
        if (state.inFlowMode && state.flowModeScreenState !== 0) {
          exitFlowMode = true;
          // deactivate flow mode
          setState({ inFlowMode: false, flowModeScreenState: state.flowModeScreenState });
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
    const command = {
      action: !state.inFlowMode ? "codetime.enableFlow" : "codetime.exitFlowMode",
      command: "command_execute",
    };
    props.vscode.postMessage(command);
    // update the state
    setState({ inFlowMode: !state.inFlowMode, flowModeScreenState: stateData.flowModeScreenState });
  }

  return (
    <Grid container className={classes.root}>
      <Grid item xs={12}>
        <ListItemText primary="Flow Mode" secondary="Block out distractions" />
      </Grid>
      <Grid item xs={12}>
        <Button variant="contained" color="primary" onClick={flowModeClickHandler} className={classes.button}>
          {!state.inFlowMode ? "Enter Flow Mode" : "Exit Flow Mode"}
        </Button>
      </Grid>
    </Grid>
  );
}
