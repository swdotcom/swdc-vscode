import React, { useEffect } from "react";
import { makeStyles } from "@material-ui/core/styles";
import LinearProgress from "@material-ui/core/LinearProgress";
import Card from "@material-ui/core/Card";
import CardContent from "@material-ui/core/CardContent";
import Button from "@material-ui/core/Button";
import Typography from "@material-ui/core/Typography";
import Link from "@material-ui/core/Link";
import Grid from "@material-ui/core/Grid";

const useStyles = makeStyles((theme) => ({
  root: {
    flexGrow: 1,
    width: "100%",
    margin: 0,
    padding: 0,
  },
  setup: {
    width: "100%",
  },
  subinfo: {
    marginRight: 4,
    fontSize: 11,
  },
}));

export default function Setup(props) {
  // Similar to componentDidMount and componentDidUpdate:
  useEffect(() => {});

  const stateData = props.stateData;

  const progress = !stateData.registered ? 40 : 75;

  const classes = useStyles();

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

  return (
    <Grid container className={classes.root}>
      <Grid item xs={12}>
        <Card className={classes.setup} variant="outlined">
          <CardContent>
            <Typography>Getting started</Typography>
          </CardContent>
          <CardContent>
            <LinearProgress variant="determinate" value={progress} />
          </CardContent>
          <CardContent>
            <Button variant="contained" color="primary" onClick={setupClickHandler}>
              {!stateData.registered ? "Register your account" : "Connect a Slack Workspace"}
            </Button>
          </CardContent>
          {!stateData.registered && (
            <CardContent>
              <Typography className={classes.subinfo} display="inline">
                Already have an account?
              </Typography>
              <Link href="#" onClick={loginClickHandler} display="inline">
                Log in
              </Link>
            </CardContent>
          )}
        </Card>
      </Grid>
    </Grid>
  );
}
