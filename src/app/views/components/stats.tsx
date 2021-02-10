import React, { useEffect } from "react";
import Button from "@material-ui/core/Button";
import ListItemText from "@material-ui/core/ListItemText";
import Grid from "@material-ui/core/Grid";
import { makeStyles } from "@material-ui/core/styles";
import { DashboardIcon, PawIcon, ProjectSummaryIcon } from "../icons";

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
    margin: 0,
    padding: 0,
  },
  listItemPrimary: {
    fontWeight: 500,
  },
  listItem: {
    marginTop: 0,
  },
}));

export default function Stats(props) {
  // Similar to componentDidMount and componentDidUpdate:
  useEffect(() => {});
  const classes = useStyles();

  function dashboardClickHandler() {
    const command = {
      action: "codetime.viewDashboard",
      command: "command_execute",
    };
    props.vscode.postMessage(command);
  }

  function projectSummaryClickHandler() {
    const command = {
      action: "codetime.generateProjectSummary",
      command: "command_execute",
    };
    props.vscode.postMessage(command);
  }

  function softwareDashboardClickHandler() {
    const command = {
      action: "codetime.softwareKpmDashboard",
      command: "command_execute",
    };
    props.vscode.postMessage(command);
  }

  return (
    <Grid container className={classes.root}>
      <Grid item xs={12}>
        <ListItemText primary="Stats" secondary="Data in your editor" className={classes.listItem} classes={{ primary: classes.listItemPrimary }} />
      </Grid>
      <Grid item xs={12}>
        <Button onClick={dashboardClickHandler} className={classes.textbutton} startIcon={<DashboardIcon />}>
          Dashboard
        </Button>
      </Grid>
      <Grid item xs={12}>
        <Button onClick={projectSummaryClickHandler} className={classes.textbutton} startIcon={<ProjectSummaryIcon />}>
          Project summary
        </Button>
      </Grid>
      <Grid item xs={12}>
        <Button onClick={softwareDashboardClickHandler} className={classes.textbutton} startIcon={<PawIcon />}>
          More data at Software.com
        </Button>
      </Grid>
    </Grid>
  );
}