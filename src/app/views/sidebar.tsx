import React from 'react';
import Setup from "./components/setup";
import Grid, { GridSpacing } from '@material-ui/core/Grid';
import useMediaQuery from '@material-ui/core/useMediaQuery';
import { createMuiTheme, ThemeProvider } from '@material-ui/core/styles';
import CssBaseline from '@material-ui/core/CssBaseline';
import blue from '@material-ui/core/colors/blue';

export default function SideBar(props) {

  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');

  /**
   * export enum ColorThemeKind {
      Light = 1,
      Dark = 2,
      HighContrast = 3
   }
   window.activeColorTheme.kind
   */
  const theme = React.useMemo(
    () =>
      createMuiTheme({
        palette: {
          type: prefersDarkMode ? 'dark' : 'light',
          primary: blue,
        },
        overrides: {
          MuiButton: {
            root: {
              fontSize: 10
            }
          },
          MuiCard: {
            root: {
              padding: 4,
              margin: 2,
              width: "100%"
            }
          },
          MuiCardContent: {
            root: {
              width: "100%",
              paddingTop: 8,
              paddingBottom: 8,
              paddingLeft: 16,
              paddingRight: 16,
              '&:last-child': {
                paddingBottom: 24,
              }
            },
          },
        },
      }),
    [prefersDarkMode],
  );

  const stateData = props.stateData;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline/>
      <Grid container spacing={1} direction="column" justify="flex-start" alignItems="center">
        {(!stateData.registered || !stateData.slackConnected) && (
        <Grid container xs={12}>
          <Setup stateData={props.stateData} vscode={props.vscode}/>
        </Grid>)}
      </Grid>
    </ThemeProvider>
  );
}