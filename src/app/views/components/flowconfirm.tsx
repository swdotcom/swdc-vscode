import React, { useEffect } from "react";
import { makeStyles } from "@material-ui/core/styles";
import Button from "@material-ui/core/Button";
import Grid from "@material-ui/core/Grid";

const useStyles = makeStyles((theme) => ({
  root: {
    width: "100%",
  },
  gridItem: {
    marginLeft: 16,
    marginRight: 16,
    marginTop: 8,
  },
}));

export interface FlowConfirmProps {
  onClick: (value?: string) => void;
}

export default function FlowConfirm(props: FlowConfirmProps) {
  const { onClick } = props;
  // Similar to componentDidMount and componentDidUpdate:
  useEffect(() => {});
  const classes = useStyles();

  const continueClick = () => {
    onClick("continue");
  };

  const connectSlackClick = () => {
    onClick("connect");
  };

  const cancelClick = () => {
    onClick("cancel");
  };

  return (
    <Grid container className={classes.root}>
      <Grid item xs={12} className={classes.gridItem}>
        <Button variant="contained" color="primary" onClick={continueClick}>
          Continue anyway
        </Button>
      </Grid>
      <Grid item xs={12} className={classes.gridItem}>
        <Button variant="contained" color="primary" onClick={connectSlackClick}>
          Connect Slack
        </Button>
      </Grid>
      <Grid item xs={12} className={classes.gridItem}>
        <Button variant="contained" onClick={cancelClick}>
          Cancel
        </Button>
      </Grid>
    </Grid>
  );
}
