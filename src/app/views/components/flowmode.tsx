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
import HelpIcon from "@material-ui/icons/Help";
import Typography from "@material-ui/core/Typography";
import FlowConfirm from "./flowconfirm";
import Popover from "@material-ui/core/Popover";

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
  typography: {
    padding: theme.spacing(2),
  },
}));

export default function FlowMode(props) {
  const classes = useStyles();
  const stateData = props.stateData;

  const [state, setState] = useState({
    inFlowMode: stateData.inFlowMode,
    flowModeScreenState: stateData.flowModeScreenState,
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

  const [anchorEl, setAnchorEl] = React.useState<HTMLButtonElement | null>(null);

  const showFlowModeInfo = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const open = Boolean(anchorEl);
  const id = open ? "simple-popover" : undefined;

  return (
    <Grid container className={classes.root}>
      <Grid item xs={12}>
        <List style={{ padding: 0, margin: 0 }}>
          <ListItem style={{ padding: 0, margin: 0 }}>
            <ListItemText primary="Flow Mode" secondary="Block out distractions" />
            <ListItemSecondaryAction>
              <IconButton edge="end" aria-label="Flow Mode Info" onClick={showFlowModeInfo}>
                <HelpIcon />
              </IconButton>
              <Popover
                id={id}
                open={open}
                anchorEl={anchorEl}
                onClose={handleClose}
                anchorOrigin={{
                  vertical: "bottom",
                  horizontal: "center",
                }}
                transformOrigin={{
                  vertical: "top",
                  horizontal: "center",
                }}
              >
                <Typography className={classes.typography}>
                  Flow automations that you can use to toggle Zen mode, enter full screen, and hide your Dock. If you connect a Slack workspace, you
                  can also pause notifications, update your profile status, and set your presence to away.
                </Typography>
              </Popover>
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
