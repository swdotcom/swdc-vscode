import React, { useEffect } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Button from '@material-ui/core/Button';
import Typography from '@material-ui/core/Typography';
import Grid from '@material-ui/core/Grid';

const useStyles = makeStyles((theme) => ({
  root: {
    flexGrow: 1,
		width: "100%",
		margin: 0,
		padding: 0
  },
  subtitle: {
    color: "#999999",
    fontSize: 10,
    fontWeight: 400,
  },
  button: {
	  marginTop: 10
  }
}));

export default function FlowMode(props) {

  // Similar to componentDidMount and componentDidUpdate:
  useEffect(() => {
  });

  const stateData = props.stateData;

  const classes = useStyles();

  function flowModeClickHandler() {
    let command = {
      action: !stateData.inFlowMode ? "codetime.enableFlow" : "codetime.pauseFlow",
      command: "command_execute"
    };
    props.vscode.postMessage(command);
  }

  return (
    <Grid container className={classes.root}>
		  <Grid item xs={12}>
        <Typography>Flow Mode</Typography>
        <Typography className={classes.subtitle}>Block out distractions</Typography>
      </Grid>
		  <Grid item xs={12}>
        <Button variant="contained" color="primary" onClick={flowModeClickHandler}
        className={classes.button}>
        { !stateData.inFlowMode ? "Enter Flow Mode" :  "Exit Flow Mode" }
        </Button>
      </Grid>
	  </Grid>
  );
}