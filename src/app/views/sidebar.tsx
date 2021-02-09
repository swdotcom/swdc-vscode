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

const useStyles = makeStyles((theme) => ({
  root: {
    flexGrow: 1,
    width: "100%",
    margin: 0,
    padding: 0,
  },
  gridItem: {
    marginTop: 10,
    marginButtom: 10,
  },
  gridItemSetup: {
    marginTop: 10,
    marginButtom: 10,
    backgroundColor: blue[500],
  },
}));

export default function SideBar(props) {
  const classes = useStyles();
  const stateData = props.stateData;

  const currentColorKind = props.stateData.currentColorKind;
  const prefersDarkMode = !!(currentColorKind === 2);

  /**
   * window.activeColorTheme.kind
   * export enum ColorThemeKind {
      Light = 1,
      Dark = 2,
      HighContrast = 3
   }
   */
  const theme = React.useMemo(
    () =>
      createMuiTheme({
        typography: {
          fontFamily: "Arial, Roboto, sans-serif",
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
          MuiListItem: {
            root: {
              disableGutters: true,
            },
          },
          MuiButton: {
            root: {
              width: "100%",
              margin: 2,
              fontSize: 12,
              textTransform: "none",
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
              marginTop: 8,
              marginBottom: 8,
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
