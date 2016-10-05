/**
 * Based on a script provided by @chrisurban
 * https://github.com/chrisurban/jira-sprint-reporting/blob/master/general-query.gs
 */

var jirauser = "jirausername";
var jiraauth = "seriouslysecurepassword";
var jiraurl  = "https://jira.example.com/";

/**
 *  Users included in this array will be ignored by the script. Their time will
 *  not be checked. They will not receive emails if they do not track all of
 *  their time.
 *
 ********************************
 *  TO IGNORE A USER:
 ********************************
 *   Include the person's Jira username (not email, not full name) in the array
 *   below. Usernames can be found in the Jira user browser. You need sufficient
 *   Jira permissions to access this page.
 *   https://jira.zivtech.com/secure/admin/user/UserBrowser.jspa
 */
var ignoreUsers = ['archive', 'sysadmin', 'testguest', 'Alex', 'samantha', 'allie', 'jdelaigle', 'MoGillette'];

function authenticate() {
  var params = {
    method : "get",
    accept : "application/json",
      headers: {"Authorization" : "Basic " + Utilities.base64Encode( jirauser + ":" + jiraauth )}
  };

  return params;
}

/**
 * Helper function that makes an API call to Jira.
 *
 * @param query
 *  string; The API endpoint you want to hit. Include query parameters.
 */
function callJira(query) {
  var data = UrlFetchApp.fetch( jiraurl + query, authenticate() );
  data = data.getContentText();
  data = JSON.parse(data);

  return data;
}

function getUsers() {
  var users = callJira("rest/api/2/user/search?startAt=0&maxResults=1000&username=zivtech");

  return users;
}

/**
 * Function returning yesterday's date and the date of the first day of the week.
 *
 * I'm using the term 'yesterday' a bit liberally here. In most cases the
 * previous working day is the same as yesterday. The only exception is Sunday.
 */
function getDates() {
  var dates = {
    yesterday : new Date(),
    firstDayInWeek : new Date(),
  };

  dates.yesterday.setDate(dates.yesterday.getDate() - 1);
  dates.firstDayInWeek.setDate(dates.firstDayInWeek.getDate() - dates.firstDayInWeek.getDay());

  if (dates.yesterday.getDay() >= 5) {
    dates.yesterday = false;
  } else {
    if (dates.yesterday.getDay() == 0) {
    dates.yesterday.setDate(dates.yesterday.getDate() - 2);
    }
    // Format to work in Jira filter. Consider making a small helper function.
    dates.yesterday = dates.yesterday.toISOString().substr(0,10);
    dates.firstDayInWeek = dates.firstDayInWeek.toISOString().substr(0,10);
  }

  return dates;
}

/**
 * Fetch a user's worklogs and determine if they've tracked all their time.
 *
 * @param username
 *  string; The Jira username of the person whose time should be fetched.
 * @param dateFrom
 *  string; The date you want to collect worklogs from in yyyy-mm-dd format.
 * @param dateTo
 *  string; The date you want to collect worklogs to in yyyy-mm-dd format.
 */
function getTimeTracked(username, dateFrom, dateTo) {
  var query = "dateFrom=" + dateFrom;
  query += "&dateTo=" + dateTo;
  query += "&username=" + username;

  var worklogs = callJira("rest/tempo-timesheets/3/worklogs/?" + query);
  var time = 0;

  for (n = 0; n < worklogs.length; ++n) {
    var worklog = worklogs[n];
    var worklogTime = worklog['timeSpentSeconds'];
    time += worklogTime;
  }
  time = time / 3600;

  return time;
}

/**
 * Sends an email reminding a user to track his or her time.
 *
 * @param email
 *  string; The email address to which the email should be sent.
 */
function sendEmail(email) {
  MailApp.sendEmail({
    to: email,
    subject: "You haven't tracked all your time this week!",
    htmlBody: 'Tsk tsk. Go finish up, you sinner.<br /><br />' +
    'You say: <a href="https://jira.zivtech.com/secure/TempoUserBoard!timesheet.jspa">"I\'m so sorry, I\'ll do that right away!"<br />',
    noReply: true
  });
}

/**
 * Function checking tracked time and acting on its findings.
 */
function checkTime() {
  var dates = getDates();
  var timeRequired = new Date();
  timeRequired = timeRequired.getDay() - 1;
  timeRequired = timeRequired * 7;

  if (dates.yesterday) {

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    sheet.clearContents();

    var users = getUsers();

    for (i = 0; i < users.length; ++i) {
      var user = users[i];
      if (ignoreUsers.indexOf(user['name']) == -1) {
        var time = getTimeTracked(user['name'], dates.firstDayInWeek, dates.yesterday);
        if (time >= timeRequired) {
          sheet.appendRow([user['displayName'], time, 'Yes!']);
        } else if (time < timeRequired) {
          sheet.appendRow([user['displayName'], time, 'No']);
          sendEmail(user['emailAddress']);
        } else {
          Logger.log("Could not determine if " + user['displayName'] + " tracked all of his or her time.")
        };
      };
    };
  };
}
