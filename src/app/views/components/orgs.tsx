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
    padding: theme.spacing(0.25, 0.5),
    fontWeight: 500,
  },
  link: {
    color: "#FFF",
  },
}));

export default function Orgs(props) {
  // Similar to componentDidMount and componentDidUpdate:
  useEffect(() => {});
  const classes = useStyles();
  const stateData = props.stateData;

  function orgCreateClickHandler() {
    const command = {
      action: "codetime.createOrg",
      command: "command_execute",
    };
    props.vscode.postMessage(command);
  }

  function orgClickHandler(org) {
    const command = {
      action: "codetime.showOrgDashboard",
      command: "command_execute",
      arguments: [org.name],
    };
    props.vscode.postMessage(command);
  }

  if (!stateData.registered) {
    return <></>;
  }

  return (
    <Grid container className={classes.root}>
      <Grid item xs={12} style={{ width: "100%" }}>
        {!stateData.orgs.length ? (
          <Card className={classes.setup} variant="outlined">
            <CardContent>
              <Typography gutterBottom>🚀 Release faster with delivery insights</Typography>
              <Typography color="textSecondary" variant="subtitle2">
                Measure and improve your organization’s DevOps performance with real-time insights.
              </Typography>
            </CardContent>
            <CardContent>
              <Button variant="contained" color="primary" onClick={orgCreateClickHandler}>
                Get your free GitHub report
              </Button>
            </CardContent>
            <CardContent>
              <Typography className={classes.subinfo}>
                Trust and data privacy matter. Learn about{" "}
                <a className={classes.link} href="https://sftw.webflow.io/data-privacy">
                  how we secure data for over 150,000 developers
                </a>
                .
              </Typography>
            </CardContent>
          </Card>
        ) : (
          <Grid container className={classes.root}>
            <Grid item xs={12}>
              <ListItemText primary="Organizations" secondary="View your DevOps metrics" />
            </Grid>
            {stateData.orgs.map((org, index) => (
              <Grid item xs={12} key={index}>
                <Button
                  onClick={() => orgClickHandler(org)}
                  className={classes.textbutton}
                  startIcon={<GroupIcon fontSize="small" style={{ color: blue[500] }} />}
                >
                  {org.display_name}
                </Button>
              </Grid>
            ))}
          </Grid>
        )}
      </Grid>
    </Grid>
  );
}
