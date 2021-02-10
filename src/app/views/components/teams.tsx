import React, { useEffect } from "react";
import { makeStyles } from "@material-ui/core/styles";
import Card from "@material-ui/core/Card";
import CardContent from "@material-ui/core/CardContent";
import Button from "@material-ui/core/Button";
import Typography from "@material-ui/core/Typography";
import Grid from "@material-ui/core/Grid";
import ListItemText from "@material-ui/core/ListItemText";
import GroupIcon from "@material-ui/icons/Group";
import blue from "@material-ui/core/colors/blue";

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
  },
  listItemPrimary: {
    fontWeight: 500,
  },
  listItem: {
    marginTop: 0,
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

  return (
    <Grid container className={classes.root}>
      <Grid item xs={12} style={{ width: "100%" }}>
        {!stateData.teams.length && (
          <Card className={classes.setup} variant="outlined">
            <CardContent>
              <ListItemText
                primary="Is Facebook right about no meeting Wednesdays?"
                secondary="Get the data for your team and designate the best day for coding."
              />
            </CardContent>
            <CardContent>
              <Button variant="contained" color="primary" onClick={teamCreateClickHandler}>
                Create a team
              </Button>
            </CardContent>
            <CardContent>
              <Typography className={classes.subinfo}>Trust and data privacy matters. Your data is always only for you.</Typography>
            </CardContent>
          </Card>
        )}
        {stateData.teams.length && (
          <Grid container className={classes.root}>
            <Grid item xs={12}>
              <ListItemText
                primary="Teams"
                secondary="View your team dashboard"
                className={classes.listItem}
                classes={{ primary: classes.listItemPrimary }}
              />
            </Grid>
            {stateData.teams.map((team, index) => (
              <Grid item xs={12}>
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
