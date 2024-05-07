
/* ===== Dashboard Tab ===== */


function openDash(evt, cityName) {
    var i, tabcontent, tablinks;
    tabcontent = document.getElementsByClassName("dash-tabcontent");
    for (i = 0; i < tabcontent.length; i++) {
      tabcontent[i].style.display = "none";
    }
    tablinks = document.getElementsByClassName("dashboradLinks");
    for (i = 0; i < tablinks.length; i++) {
      tablinks[i].className = tablinks[i].className.replace(" active", "");
    }
    document.getElementById(cityName).style.display = "block";
    evt.currentTarget.className += " active";
  }
  
  document.addEventListener('DOMContentLoaded', function() {
    var productOpenButton = document.getElementById("defaultDashboard");
    if (productOpenButton) {
      productOpenButton.click();
    } else {
        // console.error("Element with ID 'defaultOpen' not found.");
    }
  });