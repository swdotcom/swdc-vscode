import React, { useState, useEffect } from "react";
import { makeStyles } from "@material-ui/core/styles";
import Card from "@material-ui/core/Card";
import CardContent from "@material-ui/core/CardContent";
import Button from "@material-ui/core/Button";
import Typography from "@material-ui/core/Typography";
import Grid from "@material-ui/core/Grid";
import ListItemText from "@material-ui/core/ListItemText";
import GroupIcon from "@material-ui/icons/Group";
import blue from "@material-ui/core/colors/blue";
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import ListItemSecondaryAction from "@material-ui/core/ListItemSecondaryAction";
import IconButton from "@material-ui/core/IconButton";
import RefreshIcon from "@material-ui/icons/Refresh";

const useStyles = makeStyles((theme) => ({
  root: {
    flexGrow: 1,
    width: "100%",
    margin: 0,
    padding: 0,
    marginBottom: 10,
  },
  setup: {
    width: "100%",
    flexGrow: 1,
  },
  subinfo: {
    marginRight: 4,
    fontSize: 12,
  },
  textbutton: {
    width: "100%",
    justifyContent: "flex-start",
    padding: theme.spacing(0.25, 0.5),
    fontWeight: 500,
  },
  iconBtnRoot: {
    color: "rgba(222,222,222,0.75)",
  },
  secondaryAction: {
    right: 0,
  },
}));

export default function Teams(props) {
  // Similar to componentDidMount and componentDidUpdate:
  useEffect(() => {});
  const classes = useStyles();
  const stateData = props.stateData;

  function teamCreateClickHandler() {
    const command = {
      action: "codetime.createTeam",
      command: "command_execute",
    };
    props.vscode.postMessage(command);
  }

  function teamClickHandler(team) {
    const command = {
      action: "codetime.showTeamDashboard",
      command: "command_execute",
      arguments: [team.id],
    };
    props.vscode.postMessage(command);
  }

  const refreshTeamsClick = () => {
    const command = {
      action: "codetime.reloadTeams",
      command: "command_execute",
    };
    props.vscode.postMessage(command);
  };

  return (
    <Grid container className={classes.root}>
      <Grid item xs={12} style={{ width: "100%" }}>
        {!stateData.teams.length ? (
          <Card className={classes.setup} variant="outlined">
            <CardContent>
              <Typography gutterBottom>🚀 Software Teams</Typography>
              <Typography color="textSecondary" variant="subtitle2">
                Discover your team's best day for coding, and more.
              </Typography>
            </CardContent>
            <CardContent>
              <Button variant="contained" color="primary" onClick={teamCreateClickHandler}>
                Create a team
              </Button>
            </CardContent>
            <CardContent>
              <Typography className={classes.subinfo}>Trust and data privacy matter. Your individual data is always private.</Typography>
            </CardContent>
          </Card>
        ) : (
          <Grid container className={classes.root}>
            <Grid item xs={12}>
              <List style={{ padding: 0, margin: 0 }}>
                <ListItem style={{ padding: 0, margin: 0 }}>
                  <ListItemText primary="Teams" secondary="View your team dashboard" />
                  <ListItemSecondaryAction classes={{ root: classes.secondaryAction }}>
                    <IconButton
                      size="small"
                      classes={{ root: classes.iconBtnRoot }}
                      edge="end"
                      aria-label="Flow Mode Info"
                      onClick={refreshTeamsClick}
                      disabled={state.loading}
                    >
                      <RefreshIcon style={{ color: blue[500] }} />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              </List>
            </Grid>
            {stateData.teams.map((team, index) => (
              <Grid item xs={12} key={index}>
                <Button
                  onClick={() => teamClickHandler(team)}
                  className={classes.textbutton}
                  startIcon={<GroupIcon fontSize="small" style={{ color: blue[500] }} />}
                >
                  {team.name}
                </Button>
              </Grid>
            ))}
          </Grid>
        )}
      </Grid>
    </Grid>
  );
}
