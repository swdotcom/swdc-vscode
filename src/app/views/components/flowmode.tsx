import React, { useEffect } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Button from '@material-ui/core/Button';
import Typography from '@material-ui/core/Typography';
import Container from '@material-ui/core/Container';

const useStyles = makeStyles((theme) => ({
  container: {
    width: "100%",
    marginTop: 10,
	marginBottom: 10
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

export default function Setup(props) {

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
    <Container className={classes.container}>
		<Typography>Flow Mode</Typography>
		<Typography className={classes.subtitle}>Block out distractions</Typography>
		<Button variant="contained" color="primary" onClick={flowModeClickHandler}
			className={classes.button}>
			{ !stateData.inFlowMode ? "Enter Flow Mode" :  "Exit Flow Mode" }
		</Button>
    </Container>
  );
}