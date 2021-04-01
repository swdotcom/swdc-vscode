import React from "react";
import { makeStyles, Theme, createStyles } from "@material-ui/core/styles";
import TreeView from "@material-ui/lab/TreeView";
import TreeItem, { TreeItemProps } from "@material-ui/lab/TreeItem";
import Typography from "@material-ui/core/Typography";
import ArrowDropDownIcon from "@material-ui/icons/ArrowDropDown";
import ArrowRightIcon from "@material-ui/icons/ArrowRight";
import { SvgIconProps } from "@material-ui/core/SvgIcon";
import ControlPointTwoToneIcon from "@material-ui/icons/ControlPointTwoTone";
import IconButton from "@material-ui/core/IconButton";
import RemoveCircleTwoToneIcon from "@material-ui/icons/RemoveCircleTwoTone";
import { SlackWorkspaceIcon, SlackFolderIcon } from "../icons";
import blue from "@material-ui/core/colors/blue";

let vscode = null;

declare module "csstype" {
  interface Properties {
    "--tree-view-color"?: string;
    "--tree-view-bg-color"?: string;
  }
}

type StyledTreeItemProps = TreeItemProps & {
  bgColor?: string;
  color?: string;
  labelIcon?: React.ElementType<SvgIconProps>;
  labelInfo?: string;
  labelText: string;
  isWorkspace?: boolean;
  isLeaf?: boolean;
  authId?: string;
};

const useTreeItemStyles = makeStyles((theme: Theme) =>
  createStyles({
    root: {
      color: theme.palette.text.secondary,
      "&:hover > $content": {
        backgroundColor: theme.palette.action.hover,
      },
      margin: 0,
      padding: theme.spacing(0.25, 0.5),
    },
    content: {
      width: "100%",
      color: theme.palette.text.primary,
      fontWeight: theme.typography.fontWeightMedium,
    },
    label: {
      fontWeight: "inherit",
      color: "inherit",
    },
    labelRoot: {
      display: "flex",
      alignItems: "center",
      padding: theme.spacing(0.25, 0.5),
    },
    labelIcon: {
      marginRight: theme.spacing(1),
    },
    labelText: {
      fontWeight: "inherit",
      flexGrow: 1,
    },
  })
);

function removeWorkspaceClickHandler(authId: string) {
  const command = {
    action: "codetime.disconnectSlackWorkspace",
    command: "command_execute",
    arguments: [authId],
  };
  vscode.postMessage(command);
}

function StyledTreeItem(props: StyledTreeItemProps) {
  const classes = useTreeItemStyles();
  const { labelText, labelIcon: LabelIcon, labelInfo, color, bgColor, isWorkspace, isLeaf, authId, ...other } = props;

  return (
    <TreeItem
      icon={isLeaf && LabelIcon && <LabelIcon color="inherit" className={classes.labelIcon} style={{ color: blue[500] }} />}
      label={
        <div className={classes.labelRoot}>
          {!isLeaf && LabelIcon && <LabelIcon color="inherit" className={classes.labelIcon} style={{ color: blue[500] }} />}
          <Typography variant="body2" className={classes.labelText}>
            {labelText}
          </Typography>
          <Typography variant="caption" color="inherit">
            {labelInfo}
          </Typography>
          {isWorkspace && (
            <IconButton
              aria-label="Disconnect workspace"
              style={{ color: blue[500], width: 24, height: 24 }}
              onClick={() => removeWorkspaceClickHandler(authId)}
            >
              <RemoveCircleTwoToneIcon />
            </IconButton>
          )}
        </div>
      }
      style={{
        "--tree-view-color": color,
        "--tree-view-bg-color": bgColor,
      }}
      classes={{
        root: classes.root,
        content: classes.content,
        label: classes.label,
      }}
      {...other}
    />
  );
}

const useStyles = makeStyles(
  createStyles({
    root: {
      width: "100%",
      flexGrow: 1,
    },
  })
);

export default function Workspaces(props) {
  const classes = useStyles();

  vscode = props.vscode;
  const workspaces = props.stateData?.slackWorkspaces ?? [];

  function addWorkspaceClickHandler() {
    const command = {
      action: "codetime.connectSlackWorkspace",
      command: "command_execute",
    };
    vscode.postMessage(command);
  }

  return (
    <TreeView className={classes.root} defaultCollapseIcon={<ArrowDropDownIcon />} defaultExpandIcon={<ArrowRightIcon />}>
      <StyledTreeItem nodeId="workspaces" labelText="Workspaces" key="workspaces" labelIcon={SlackFolderIcon}>
        {workspaces.map((value, index) => {
          return (
            <StyledTreeItem
              nodeId={value.team_domain}
              key={value.team_domain}
              labelText={value.team_domain}
              labelIcon={SlackWorkspaceIcon}
              isWorkspace={true}
              isLeaf={true}
              authId={value.authId}
            />
          );
        })}
        <StyledTreeItem
          onClick={addWorkspaceClickHandler}
          nodeId="add_workspace"
          key="add_workspace"
          labelText="Add workspace"
          isLeaf={true}
          labelIcon={ControlPointTwoToneIcon}
        />
      </StyledTreeItem>
    </TreeView>
  );
}
