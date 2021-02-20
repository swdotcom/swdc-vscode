import React, { useEffect } from "react";
import { makeStyles, createStyles, withStyles, Theme } from "@material-ui/core/styles";
import LinearProgress from "@material-ui/core/LinearProgress";
import Paper from "@material-ui/core/Paper";
import CardContent from "@material-ui/core/CardContent";
import Button from "@material-ui/core/Button";
import Typography from "@material-ui/core/Typography";
import Link from "@material-ui/core/Link";
import Grid from "@material-ui/core/Grid";
import blue from "@material-ui/core/colors/blue";
import grey from "@material-ui/core/colors/grey";

const useStyles = makeStyles((theme) => ({
  root: {
    flexGrow: 1,
    width: "100%",
    margin: 0,
    padding: 0,
    backgroundColor: "transparent",
  },
  setup: {
    width: "100%",
    backgroundColor: "transparent",
  },
  setupButtonContent: {
    textAlign: "center",
  },
  setupButton: {
    backgroundColor: "#ffffff",
    color: blue[500],
    maxWidth: 200,
  },
  subinfo: {
    marginRight: 4,
    fontSize: 12,
    color: grey[200],
  },
  link: {
    fontSize: 14,
    color: "#ffffff",
    background: "transparent",
    textDecoration: "none",
    "&:hover": {
      fontSize: 14,
      color: "rgb(255, 255, 255, 0.8)",
      textDecoration: "none",
    },
  },
  typography: {
    color: "#FFF",
  },
}));

const BorderLinearProgress = withStyles((theme: Theme) =>
  createStyles({
    root: {
      height: 5,
      borderRadius: 4,
    },
    colorPrimary: {
      backgroundColor: blue[200],
    },
    bar: {
      borderRadius: 4,
      backgroundColor: "#ffffff",
    },
  })
)(LinearProgress);

export default function Setup(props) {
  // Similar to componentDidMount and componentDidUpdate:
  useEffect(() => {});
  const classes = useStyles();
  const stateData = props.stateData;

  const progress = !stateData.registered ? 35 : 70;

  function setupClickHandler() {
    const command = {
      action: !stateData.registered ? "codetime.signUpAccount" : "codetime.connectSlackWorkspace",
      command: "command_execute",
    };
    props.vscode.postMessage(command);
  }

  function loginClickHandler() {
    const command = {
      action: "codetime.codeTimeExisting",
      command: "command_execute",
    };
    props.vscode.postMessage(command);
  }

  function skipSlackConnectHandler() {
    const command = {
      action: "codetime.skipSlackConnect",
      command: "command_execute",
    };
    props.vscode.postMessage(command);
  }

  return (
    <Grid container className={classes.root}>
      <Grid item xs={12}>
        <Paper className={classes.setup} elevation={0}>
          <CardContent>
            <Typography className={classes.typography}>Getting Started</Typography>
          </CardContent>
          <CardContent>
            <BorderLinearProgress variant="determinate" value={progress} />
          </CardContent>
          <CardContent className={classes.setupButtonContent}>
            <Button variant="contained" onClick={setupClickHandler} className={classes.setupButton}>
              {!stateData.registered ? "Register your account" : "Connect a Slack Workspace"}
            </Button>
          </CardContent>
          {!stateData.registered ? (
            <CardContent>
              <Typography className={classes.subinfo} display="inline">
                Already have an account?
              </Typography>
              <Link href="#" onClick={loginClickHandler} display="inline" className={classes.link}>
                Log in
              </Link>
            </CardContent>
          ) : (
            <CardContent>
              <Typography className={classes.subinfo} display="inline">
                Not using slack?
              </Typography>
              <Link href="#" onClick={skipSlackConnectHandler} display="inline" className={classes.link}>
                Skip this step.
              </Link>
            </CardContent>
          )}
        </Paper>
      </Grid>
    </Grid>
  );
}
