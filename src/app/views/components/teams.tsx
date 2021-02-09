import React, { useEffect } from "react";
import { makeStyles } from "@material-ui/core/styles";
import Card from "@material-ui/core/Card";
import CardContent from "@material-ui/core/CardContent";
import Button from "@material-ui/core/Button";
import Typography from "@material-ui/core/Typography";
import Grid from "@material-ui/core/Grid";
import ListItemText from "@material-ui/core/ListItemText";

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
  },
  subinfo: {
    marginRight: 4,
    fontSize: 11,
  },
}));

export default function Teams(props) {
  // Similar to componentDidMount and componentDidUpdate:
  useEffect(() => {});
  const classes = useStyles();

  function teamCreateClickHandler() {
    const command = {
      action: "codetime.createTeam",
      command: "command_execute",
    };
    props.vscode.postMessage(command);
  }

  return (
    <Grid container className={classes.root}>
      <Grid item xs={12}>
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
      </Grid>
    </Grid>
  );
}
