import React from "react";
import Setup from "./components/setup";
import Account from "./components/account";
import FlowMode from "./components/flowmode";
import Teams from "./components/teams";
import { createMuiTheme, ThemeProvider } from "@material-ui/core/styles";
import CssBaseline from "@material-ui/core/CssBaseline";
import blue from "@material-ui/core/colors/blue";
import Divider from "@material-ui/core/Divider";
import Stats from "./components/stats";
import { makeStyles } from "@material-ui/core/styles";
import Grid from "@material-ui/core/Grid";
import grey from "@material-ui/core/colors/grey";

const useStyles = makeStyles((theme) => ({
  root: {
    flexGrow: 1,
    width: "100%",
    margin: 0,
    padding: 0,
  },
  gridItem: {
    margin: 10,
  },
  gridItemSetup: {
    marginTop: 1,
    marginButtom: 10,
    backgroundColor: blue[500],
  },
}));

export default function SideBar(props) {
  const classes = useStyles();
  const stateData = props.stateData;

  const currentColorKind = props.stateData.currentColorKind;
  const prefersDarkMode = !!(currentColorKind === 2);

  const theme = React.useMemo(
    () =>
      createMuiTheme({
        typography: {
          fontFamily: [
            "-apple-system",
            "BlinkMacSystemFont",
            '"Segoe UI"',
            "Roboto",
            "Oxygen",
            "Ubuntu",
            "Cantarell",
            "Fira Sans",
            "Droid Sans",
            '"Helvetica Neue"',
            "sans-serif",
          ].join(","),
          fontSize: 12,
          fontWeightLight: 400,
          fontWeightRegular: 500,
          fontWeightMedium: 600,
        },
        palette: {
          type: prefersDarkMode ? "dark" : "light",
          primary: blue,
        },
        overrides: {
          MuiList: {
            root: {
              width: "100%",
            },
          },
          MuiButton: {
            root: {
              width: "100%",
              padding: 4,
              textTransform: "none",
              whiteSpace: "nowrap",
            },
            text: {
              fontSize: 12,
            },
          },
          MuiCard: {
            root: {
              padding: 4,
              margin: 2,
              width: "100%",
            },
          },
          MuiCardContent: {
            root: {
              width: "100%",
              paddingTop: 8,
              paddingBottom: 8,
              paddingLeft: 16,
              paddingRight: 16,
              "&:last-child": {
                paddingBottom: 24,
              },
            },
          },
          MuiDivider: {
            root: {
              width: "100%",
              marginTop: 4,
              marginBottom: 4,
            },
          },
          MuiListItemText: {
            root: {
              marginTop: 0,
            },
            primary: {
              fontWeight: 500,
              fontSize: 14,
            },
            secondary: {
              color: grey[500],
            },
          },
        },
      }),
    [prefersDarkMode]
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Grid container className={classes.root}>
        {(!stateData.registered || !stateData.slackConnected) && (
          <Grid item xs={12} className={classes.gridItemSetup}>
            <Setup stateData={props.stateData} vscode={props.vscode} />
          </Grid>
        )}
        <Grid item xs={12} className={classes.gridItem}>
          <FlowMode stateData={props.stateData} vscode={props.vscode} />
        </Grid>
        <Divider />
        <Grid item xs={12} className={classes.gridItem}>
          <Stats vscode={props.vscode} stateData={props.stateData} />
        </Grid>
        <Divider />
        <Grid item xs={12} className={classes.gridItem}>
          <Account vscode={props.vscode} stateData={props.stateData} />
        </Grid>
        <Divider />
        <Grid item xs={12} className={classes.gridItem}>
          <Teams vscode={props.vscode} stateData={props.stateData} />
        </Grid>
      </Grid>
    </ThemeProvider>
  );
}
